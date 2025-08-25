import { Command } from "#structures/classes/Command";
import { ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import emoji from "#config/emoji";

class PlayNowCommand extends Command {
  constructor() {
    super({
      name: "playnow",
      description: "Play music immediately (skips current song)",
      usage: "playnow <query> [--src yt/am/sp/sc/dz]",
      aliases: ["pn", "playskip"],
      category: "music",
      examples: [
        "playnow never gonna give you up",
        "playnow rick astley --src yt",
        "playnow despacito --src sp",
        "playnow https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      enabledSlash: true,
      slashData: {
        name: ["music", "playnow"],
        description: "Play music immediately (skips current song)",
        options: [
          {
            name: "query",
            description: "Song name, URL, or search query",
            type: 3,
            required: true,
            autocomplete: true,
          },
          {
            name: "source",
            description: "Music source to search from",
            type: 3,
            required: false,
            choices: [
              { name: "Spotify", value: "sp" },
              { name: "YouTube", value: "yt" },
              { name: "Apple Music", value: "am" },
              { name: "SoundCloud", value: "sc" },
              { name: "Deezer", value: "dz" },
            ],
          },
        ],
      },
    });
  }

  async autocomplete({ interaction, client }) {
    try {
      const focusedOption = interaction.options.getFocused(true);

      if (focusedOption.name === 'query') {
        const query = focusedOption.value;

        if (!query || query.length < 2) {
          return interaction.respond([]);
        }

        if (this._isUrl(query)) {
          return interaction.respond([
            { name: `URL: ${query.substring(0, 90)}${query.length > 90 ? '...' : ''}`, value: query }
          ]);
        }

        const source = interaction.options.getString('source') || 'sp';
        const searchSource = this._normalizeSource(source);

        try {
          const searchResult = await client.music.search(query, {
            source: searchSource,
            limit: 10
          });

          if (!searchResult || !searchResult.tracks?.length) {
            return interaction.respond([
              { name: `No results found for "${query}"`, value: query }
            ]);
          }

          const suggestions = searchResult.tracks.slice(0, 25).map(track => {
            const title = track.info.title.length > 80
              ? track.info.title.substring(0, 77) + '...'
              : track.info.title;
            const author = track.info.author || 'Unknown';
            const duration = this._formatDuration(track.info.duration);

            return {
              name: `${title} - ${author} (${duration})`,
              value: track.info.uri || track.info.title
            };
          });

          await interaction.respond(suggestions);
        } catch (searchError) {
          logger.error('PlayNowCommand', 'Autocomplete search error:', searchError);
          return interaction.respond([
            { name: `Search "${query}"`, value: query }
          ]);
        }
      }
    } catch (error) {
      logger.error('PlayNowCommand', 'Autocomplete error:', error);
      try {
        await interaction.respond([]);
      } catch (e) {
      }
    }
  }

  async execute({ client, message, args }) {
    try {
      if (args.length === 0) {
        return message.reply({
          components: [this._createErrorContainer("Please provide a song name or URL.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const { query, source } = this._parseFlags(args);

      if (!query.trim()) {
        return message.reply({
          components: [this._createErrorContainer("Please provide a song name or URL.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          components: [this._createErrorContainer("You must be in a voice channel.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const permissions = voiceChannel.permissionsFor(message.guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        return message.reply({
          components: [this._createErrorContainer("I need permission to join and speak in your voice channel.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const player = client.music.getPlayer(message.guild.id);
      if (!player || (!player.playing && player.queue.tracks.length === 0)) {
        return message.reply({
          components: [this._createErrorContainer("Nothing is currently playing. Use `play` instead.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const loadingMessage = await message.reply({
        components: [this._createLoadingContainer(query)],
        flags: MessageFlags.IsComponentsV2,
      });

      const pm = new PlayerManager(player);

      const result = await this._handlePlayNowRequest({
        client,
        guildId: message.guild.id,
        query,
        source,
        requester: message.author,
        pm,
      });

      await this._updateMessage(loadingMessage, result);
    } catch (error) {
      client.logger?.error("PlayNowCommand", `Error in prefix command: ${error.message}`, error);
      const errorContainer = this._createErrorContainer("An error occurred. Please try again.");
      if (message) {
        await message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const query = interaction.options.getString("query");
      const source = interaction.options.getString("source");

      if (!query) {
        return interaction.reply({
          components: [this._createErrorContainer("Please provide a song name or URL.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          components: [this._createErrorContainer("You must be in a voice channel.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        return interaction.reply({
          components: [this._createErrorContainer("I need permission to join and speak in your voice channel.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const player = client.music.getPlayer(interaction.guild.id);
      if (!player || (!player.playing && player.queue.tracks.length === 0)) {
        return interaction.reply({
          components: [this._createErrorContainer("Nothing is currently playing. Use `/play` instead.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      await interaction.reply({
        components: [this._createLoadingContainer(query)],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

      const pm = new PlayerManager(player);

      const result = await this._handlePlayNowRequest({
        client,
        guildId: interaction.guild.id,
        query,
        source,
        requester: interaction.user,
        pm,
      });

      await this._updateInteraction(interaction, result);
    } catch (error) {
      client.logger?.error("PlayNowCommand", `Error in slash command: ${error.message}`, error);
      const errorContainer = this._createErrorContainer("An error occurred. Please try again.");
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ components: [errorContainer] });
        } else {
          await interaction.reply({ components: [errorContainer], ephemeral: true });
        }
      } catch (e) {
      }
    }
  }

  async _handlePlayNowRequest({ client, guildId, query, source, requester, pm }) {
    try {
      const finalquery = query;
      const options = { requester };

      if (!this._isUrl(query)) {
        options.source = this._normalizeSource(source);
      }

      const searchResult = await client.music.search(finalquery, options);

      if (!searchResult || !searchResult.tracks?.length) {
        return { success: false, message: `No results found for: ${query}` };
      }

      if (searchResult.loadType === "playlist") {
        return this._handlePlayNowPlaylist(pm, searchResult, guildId, requester.id);
      } else {
        return this._handlePlayNowSingleTrack(pm, searchResult.tracks[0]);
      }
    } catch (error) {
      client.logger?.error("PlayNowCommand", `Error handling play now request: ${error.message}`, error);
      return { success: false, message: "An error occurred while processing your request." };
    }
  }

  async _handlePlayNowSingleTrack(playerManager, track) {
    await playerManager.addTracks(track, 0);
    await playerManager.skip();

    return { success: true, type: "playing_now", track };
  }

  async _handlePlayNowPlaylist(playerManager, searchResult, guildId, userId) {
    const tracks = searchResult.tracks;

    const currentQueueSize = playerManager.queue.tracks.length;
    const queueLimitCheck = this._checkQueueLimit(currentQueueSize, tracks.length, guildId, userId);

    if (!queueLimitCheck.allowed) {
      return { success: false, message: queueLimitCheck.message, isPremiumLimit: true };
    }

    let tracksToAdd = tracks;
    let limitWarning = null;

    if (!queueLimitCheck.canAddAll) {
      tracksToAdd = tracks.slice(0, queueLimitCheck.tracksToAdd);
      const premiumStatus = queueLimitCheck.premiumStatus;
      limitWarning = premiumStatus.hasPremium
        ? `Added ${tracksToAdd.length} of ${tracks.length} tracks (premium queue limit reached)`
        : `Added ${tracksToAdd.length} of ${tracks.length} tracks (free tier limit reached). Upgrade to premium for up to ${config.queue.maxSongs.premium} songs.`;
    }

    await playerManager.addTracks(tracksToAdd, 0);
    await playerManager.skip();

    if (limitWarning) {
      return {
        success: true,
        type: "playlist_playing_now_partial",
        playlist: searchResult.playlist,
        tracks: tracksToAdd,
        totalTracks: tracks.length,
        limitWarning
      };
    }

    return {
      success: true,
      type: "playlist_playing_now",
      playlist: searchResult.playlist,
      tracks: tracksToAdd
    };
  }

  _getPremiumStatus(guildId, userId) {
    const premiumStatus = db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : 'free',
      maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free
    };
  }

  _checkQueueLimit(currentQueueSize, tracksToAdd, guildId, userId) {
    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const availableSlots = premiumStatus.maxSongs - currentQueueSize;

    if (availableSlots <= 0) {
      const limitMessage = premiumStatus.hasPremium
        ? `Premium queue is full. You can have up to ${premiumStatus.maxSongs} songs in queue.`
        : `Free tier queue is full. You can have up to ${premiumStatus.maxSongs} songs in queue. Upgrade to premium for up to ${config.queue.maxSongs.premium} songs.`;

      return {
        allowed: false,
        message: limitMessage,
        currentSize: currentQueueSize,
        maxSize: premiumStatus.maxSongs,
        isPremium: premiumStatus.hasPremium
      };
    }

    const canAddAll = tracksToAdd <= availableSlots;
    const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;

    return {
      allowed: true,
      canAddAll,
      tracksToAdd: tracksToAddActual,
      availableSlots,
      premiumStatus
    };
  }

  _createLoadingContainer(query) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('loading')} **Music Search - Play Now**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Searching to play immediately...**\n\n` +
      `├─ **${emoji.get('music')} Query:** ${query}\n` +
      `├─ **${emoji.get('folder')} Priority:** Immediate playback\n` +
      `└─ **${emoji.get('info')} Status:** Processing search request\n\n` +
      `*This will skip the current song when found*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.searchIcon || config.assets.defaultTrackArtwork)
        )
    );

    return container;
  }

  _createErrorContainer(message, isPremiumLimit = false) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('cross')} **${isPremiumLimit ? "Queue Limit" : "Error"}**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Something went wrong**\n\n` +
      `├─ **${emoji.get('info')} Issue:** ${message}\n` +
      `└─ **${emoji.get('reset')} Action:** Try again or contact support\n\n` +
      `*Please check your input and try again*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.errorIcon || config.assets.defaultTrackArtwork)
        )
    );

    return container;
  }

  _createSuccessContainer(result) {
    const container = new ContainerBuilder();

    if (result.type === "playing_now") {
      const { track } = result;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get('music')} **Now Playing Immediately**`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**Track Information**\n\n` +
        `├─ **${emoji.get('check')} Title:** ${track.info.title}\n` +
        `├─ **${emoji.get('folder')} Artist:** ${track.info.author || "Unknown"}\n` +
        `├─ **${emoji.get('info')} Duration:** ${this._formatDuration(track.info.duration)}\n` +
        `└─ **${emoji.get('add')} Status:** Playing immediately\n\n` +
        `*Previous song was skipped for immediate playback*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)
          )
      );

    } else if (result.type.startsWith("playlist_playing_now")) {
      const { playlist, tracks, limitWarning, totalTracks } = result;
      const trackCount = tracks.length;

      let title, description;
      if (result.type === "playlist_playing_now") {
        title = "Playing Playlist Now";
        description = `Playing ${trackCount} tracks immediately`;
      } else {
        title = "Playing Playlist Now";
        description = "Partial playlist loaded";
      }

      const firstTrackArt = tracks[0]?.info?.artworkUrl;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get('folder')} **${title}**`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**Playlist Information**\n\n` +
        `├─ **${emoji.get('check')} Name:** ${playlist.name}\n` +
        `├─ **${emoji.get('add')} Tracks Added:** ${trackCount}\n` +
        `├─ **${emoji.get('info')} Total Tracks:** ${totalTracks || trackCount}\n` +
        `└─ **${emoji.get('folder')} Status:** ${description}\n\n` +
        `${limitWarning || "*All tracks loaded and playing immediately*"}`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(firstTrackArt || config.assets.defaultTrackArtwork)
          )
      );
    }

    return container;
  }

  async _updateMessage(message, result) {
    try {
      const container = result.success ? this._createSuccessContainer(result) : this._createErrorContainer(result.message, result.isPremiumLimit);

      await message.edit({
        content: '',
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      client.logger?.error("PlayNowCommand", `Error updating message: ${error.message}`, error);
    }
  }

  async _updateInteraction(interaction, result) {
    try {
      const container = result.success ? this._createSuccessContainer(result) : this._createErrorContainer(result.message, result.isPremiumLimit);

      await interaction.editReply({
        content: '',
        components: [container],
      });
    } catch (error) {
      client.logger?.error("PlayNowCommand", `Error updating interaction: ${error.message}`, error);
    }
  }

  _parseFlags(args) {
    const flags = { query: [], source: null };
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--src" || arg === "--source") {
        if (i + 1 < args.length) flags.source = args[++i];
      } else if (!arg.startsWith("--")) {
        flags.query.push(arg);
      }
    }
    return { query: flags.query.join(" "), source: flags.source };
  }

  _normalizeSource(source) {
    const sourceMap = {
      yt: "ytsearch", youtube: "ytsearch",
      sp: "spsearch", spotify: "spsearch",
      am: "amsearch", apple: "amsearch",
      sc: "scsearch", soundcloud: "scsearch",
      dz: "dzsearch", deezer: "dzsearch",
      js:"jssearch", jiosaavn: "jssearch", saavn:"jssearch"
    };
    return sourceMap[source?.toLowerCase()] || "spsearch";
  }

  _isUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }
}

export default new PlayNowCommand();