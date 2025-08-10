import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";

class PlayCommand extends Command {
  constructor() {
    super({
      name: "play",
      description: "Play music from YouTube, Spotify, or other platforms",
      usage: "play <query> [--src yt/am/sp/sc/dz]",
      aliases: ["p"],
      category: "music",
      examples: [
        "play never gonna give you up",
        "play rick astley --src yt",
        "play despacito --src sp",
        "play https://www.youtube.com/watch?v  =dQw4w9WgXcQ",
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: ["music", "play"],
        description: "Play music from various sources",
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
          {
            name: "position",
            description: "Position in queue to add the song (1   =next)",
            type: 4,
            required: false,
            min_value: 1,
          },
        ],
      },
    });
  }

  async autocomplete({ interaction, client }) {
    try {
      const focusedOption   =interaction.options.getFocused(true);

      if (focusedOption.name   ==='query') {
        const query   =focusedOption.value;

        if (!query || query.length < 2) {
          return interaction.respond([]);
        }

        if (this._isUrl(query)) {
          return interaction.respond([
            { name: `URL: ${query.substring(0, 90)}${query.length > 90 ? '...' : ''}`, value: query }
          ]);
        }

        const source   =interaction.options.getString('source') || 'sp';
        const searchSource   =this._normalizeSource(source);

        try {
          const searchResult   =await client.music.search(query, {
            source: searchSource,
            limit: 10
          });

          if (!searchResult || !searchResult.tracks?.length) {
            return interaction.respond([
              { name: `No results found for "${query}"`, value: query }
            ]);
          }

          const suggestions   =searchResult.tracks.slice(0, 25).map(track   => {
            const title   =track.info.title.length > 80
              ? track.info.title.substring(0, 77) + '...'
              : track.info.title;
            const author   =track.info.author || 'Unknown';
            const duration   =this._formatDuration(track.info.duration);

            return {
              name: `${title} - ${author} (${duration})`,
              value: track.info.uri || track.info.title
            };
          });

          await interaction.respond(suggestions);
        } catch (searchError) {
          logger.error('PlayCommand', 'Autocomplete search error:', searchError);
          return interaction.respond([
            { name: `Search "${query}"`, value: query }
          ]);
        }
      }
    } catch (error) {
      logger.error('PlayCommand', 'Autocomplete error:', error);
      try {
        await interaction.respond([]);
      } catch (e) {
      }
    }
  }

  async execute({ client, message, args }) {
    try {
      if (args.length   ===0) {
        return message.reply({
          components: [this._createErrorContainer("Please provide a song name or URL.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const { query, source, position }   =this._parseFlags(args);

      if (!query.trim()) {
        return message.reply({
          components: [this._createErrorContainer("Please provide a song name or URL.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const voiceChannel   =message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          components: [this._createErrorContainer("You must be in a voice channel.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const permissions   =voiceChannel.permissionsFor(message.guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        return message.reply({
          components: [this._createErrorContainer("I need permission to join and speak in your voice channel.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const loadingMessage   =await message.reply({
        components: [this._createLoadingContainer(query)],
        flags: MessageFlags.IsComponentsV2,
      });

      const player   =client.music.getPlayer(message.guild.id) || (await client.music.createPlayer({
        guildId: message.guild.id,
        textChannelId: message.channel.id,
        voiceChannelId: voiceChannel.id
      }));

      const pm   =new PlayerManager(player);

      const result   =await this._handlePlayRequest({
        client,
        guildId: message.guild.id,
        query,
        source,
        requester: message.author,
        position,
        pm,
      });

      await this._updateMessage(loadingMessage, result, message.guild.id, client);
    } catch (error) {
      client.logger?.error("PlayCommand", `Error in prefix command: ${error.message}`, error);
      const errorContainer   =this._createErrorContainer("An error occurred. Please try again.");
      if (message) {
        await message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 }).catch(()   => {});
      }
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const query   =interaction.options.getString("query");
      const source   =interaction.options.getString("source");
      const position   =interaction.options.getInteger("position");

      if (!query) {
        return interaction.reply({
          components: [this._createErrorContainer("Please provide a song name or URL.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const voiceChannel   =interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          components: [this._createErrorContainer("You must be in a voice channel.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const permissions   =voiceChannel.permissionsFor(interaction.guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        return interaction.reply({
          components: [this._createErrorContainer("I need permission to join and speak in your voice channel.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      await interaction.reply({
        components: [this._createLoadingContainer(query)],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

      const player   =client.music.getPlayer(interaction.guild.id) || (await client.music.createPlayer({
        guildId: interaction.guild.id,
        textChannelId: interaction.channel.id,
        voiceChannelId: voiceChannel.id
      }));

      const pm   =new PlayerManager(player);

      const result   =await this._handlePlayRequest({
        client,
        guildId: interaction.guild.id,
        query,
        source,
        requester: interaction.user,
        position,
      });

      await this._updateInteraction(interaction, result, interaction.guild.id, client);
    } catch (error) {
      client.logger?.error("PlayCommand", `Error in slash command: ${error.message}`, error);
      const errorContainer   =this._createErrorContainer("An error occurred. Please try again.");
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

  async _handlePlayRequest({ client, guildId, query, source, requester, position, pm }) {
    try {
      if (!pm.isConnected) {
        await pm.connect();
      }

      const finalquery   =query;
      const options   ={ requester };

      if (!this._isUrl(query)) {
        options.source   =this._normalizeSource(source);
      }

      const searchResult   =await client.music.search(finalquery, options);

      if (!searchResult || !searchResult.tracks?.length) {
        return { success: false, message: `No results found for: ${query}` };
      }

      if (searchResult.loadType   ==="playlist") {
        return this._handlePlaylist(pm, searchResult, position, guildId, requester.id);
      } else {
        return this._handleSingleTrack(pm, searchResult.tracks[0], position, guildId, requester.id);
      }
    } catch (error) {
      client.logger?.error("PlayCommand", `Error handling play request: ${error.message}`, error);
      return { success: false, message: "An error occurred while processing your request." };
    }
  }

  async _handleSingleTrack(playerManager, track, position, guildId, userId) {
    const wasEmpty   =playerManager.queue.tracks.length   ===0 && !playerManager.isPlaying;

    const currentQueueSize   =wasEmpty ? 0 : playerManager.queue.tracks.length;
    const queueLimitCheck   =this._checkQueueLimit(currentQueueSize, 1, guildId, userId);

    if (!queueLimitCheck.allowed) {
      return { success: false, message: queueLimitCheck.message, isPremiumLimit: true };
    }

    await playerManager.addTracks(track, position ? position - 1 : undefined);

    if (wasEmpty) {
      await playerManager.play();
      return { success: true, type: "playing", track };
    } else {
      const queuePosition   =position || playerManager.queue.tracks.length;
      const premiumStatus   =this._getPremiumStatus(guildId, userId);
      return { success: true, type: "queued", track, queuePosition, showButtons: true, premiumStatus };
    }
  }

  async _handlePlaylist(playerManager, searchResult, position, guildId, userId) {
    const tracks   =searchResult.tracks;
    const wasEmpty   =playerManager.queue.tracks.length   ===0 && !playerManager.isPlaying;

    const currentQueueSize   =wasEmpty ? 0 : playerManager.queue.tracks.length;
    const queueLimitCheck   =this._checkQueueLimit(currentQueueSize, tracks.length, guildId, userId);

    if (!queueLimitCheck.allowed) {
      return { success: false, message: queueLimitCheck.message, isPremiumLimit: true };
    }

    if (!queueLimitCheck.canAddAll) {
      const tracksToAdd   =tracks.slice(0, queueLimitCheck.tracksToAdd);
      await playerManager.addTracks(tracksToAdd, position ? position - 1 : undefined);

      const premiumStatus   =queueLimitCheck.premiumStatus;
      const limitWarning   =premiumStatus.hasPremium
        ? `Added ${tracksToAdd.length} of ${tracks.length} tracks (premium queue limit reached)`
        : `Added ${tracksToAdd.length} of ${tracks.length} tracks (free tier limit reached). Upgrade to premium for up to ${config.queue.maxSongs.premium} songs.`;

      if (wasEmpty && tracksToAdd.length > 0) {
        await playerManager.play();
        return {
          success: true,
          type: "playlist_playing_partial",
          playlist: searchResult.playlist,
          tracks: tracksToAdd,
          totalTracks: tracks.length,
          limitWarning,
          premiumStatus
        };
      } else {
        return {
          success: true,
          type: "playlist_queued_partial",
          playlist: searchResult.playlist,
          tracks: tracksToAdd,
          totalTracks: tracks.length,
          limitWarning,
          premiumStatus
        };
      }
    }

    await playerManager.addTracks(tracks, position ? position - 1 : undefined);

    if (wasEmpty) {
      await playerManager.play();
      return { success: true, type: "playlist_playing", playlist: searchResult.playlist, tracks: tracks };
    } else {
      const premiumStatus   =this._getPremiumStatus(guildId, userId);
      return { success: true, type: "playlist_queued", playlist: searchResult.playlist, tracks: tracks, premiumStatus };
    }
  }

  _getPremiumStatus(guildId, userId) {
    const premiumStatus   =db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : 'free',
      maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free
    };
  }

  _checkQueueLimit(currentQueueSize, tracksToAdd, guildId, userId) {
    const premiumStatus   =this._getPremiumStatus(guildId, userId);
    const availableSlots   =premiumStatus.maxSongs - currentQueueSize;

    if (availableSlots <= 0) {
      const limitMessage   =premiumStatus.hasPremium
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

    const canAddAll   =tracksToAdd <= availableSlots;
    const tracksToAddActual   =canAddAll ? tracksToAdd : availableSlots;

    return {
      allowed: true,
      canAddAll,
      tracksToAdd: tracksToAddActual,
      availableSlots,
      premiumStatus
    };
  }

  _createLoadingContainer(query) {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Music Search")
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`Searching for: ${query}`)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.searchIcon || config.assets.defaultTrackArtwork)
        )
    );

    return container;
  }

  _createErrorContainer(message, isPremiumLimit   =false) {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(isPremiumLimit ? "Queue Limit" : "Error")
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(message)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.errorIcon || config.assets.defaultTrackArtwork)
        )
    );

    return container;
  }

  _createSuccessContainer(result) {
    const container   =new ContainerBuilder();

    if (result.type   ==="playing" || result.type   ==="queued") {
      const { track, premiumStatus }   =result;
      const title   =result.type   ==="playing" ? "Now Playing" : "Added to Queue";

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(title)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(track.info.title),
            new TextDisplayBuilder().setContent(`by ${track.info.author || "Unknown"} | ${this._formatDuration(track.info.duration)}`)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)
          )
      );

      if (result.type   ==="queued" && premiumStatus) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const queueText   =result.queuePosition ? `Position ${result.queuePosition} in queue` : "Added to queue";
        const statusText   =premiumStatus.hasPremium
          ? `Premium Queue: ${result.queuePosition || 0}/${premiumStatus.maxSongs} songs`
          : `Free Queue: ${result.queuePosition || 0}/${premiumStatus.maxSongs} songs`;

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(queueText),
              new TextDisplayBuilder().setContent(statusText)
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(config.assets.queueIcon || config.assets.defaultTrackArtwork)
            )
        );
      }

    } else if (result.type.startsWith("playlist")) {
      const { playlist, tracks, premiumStatus, limitWarning, totalTracks }   =result;
      const trackCount   =tracks.length;

      let title, description;
      if (result.type   ==="playlist_playing") {
        title   ="Playing Playlist";
        description   =`Added ${trackCount} tracks to the queue`;
      } else if (result.type   ==="playlist_playing_partial") {
        title   ="Playing Playlist";
        description   =limitWarning;
      } else if (result.type   ==="playlist_queued_partial") {
        title   ="Queued Playlist";
        description   =limitWarning;
      } else {
        title   ="Queued Playlist";
        description   =`Added ${trackCount} tracks to the queue`;
      }

      const firstTrackArt   =tracks[0]?.info?.artworkUrl;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(title)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(playlist.name),
            new TextDisplayBuilder().setContent(description)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(firstTrackArt || config.assets.defaultTrackArtwork)
          )
      );

      if ((result.type   ==="playlist_queued" || result.type   ==="playlist_queued_partial" || result.type   ==="playlist_playing_partial") && premiumStatus) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const statusText   =premiumStatus.hasPremium
          ? "Premium Queue Active"
          : `Free Queue Active | Upgrade for ${config.queue.maxSongs.premium} song limit`;

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent("Queue Status"),
              new TextDisplayBuilder().setContent(statusText)
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(config.assets.premiumIcon || config.assets.defaultTrackArtwork)
            )
        );
      }
    }

    return container;
  }

  _createButtons(trackIndex, guildId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`play_now_${trackIndex}_${guildId}`)
        .setLabel("Play Now")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`play_next_${trackIndex}_${guildId}`)
        .setLabel("Play Next")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`remove_track_${trackIndex}_${guildId}`)
        .setLabel("Remove")
        .setStyle(ButtonStyle.Danger)
    );
  }

  async _updateMessage(message, result, guildId, client) {
    try {
      const container   =result.success ? this._createSuccessContainer(result) : this._createErrorContainer(result.message, result.isPremiumLimit);

      if (result.success && result.showButtons && result.queuePosition) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const buttonRow   =this._createButtons(result.queuePosition - 1, guildId);
        container.addActionRowComponents(buttonRow);
      }

      const sentMessage   =await message.edit({
        content: '',
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      if (result.success && result.showButtons && result.queuePosition) {
        this._setupButtonCollector(sentMessage, guildId, client);
      }
    } catch (error) {
       client.logger?.error("PlayCommand", `Error updating message: ${error.message}`, error);
    }
  }

  async _updateInteraction(interaction, result, guildId, client) {
    try {
      const container   =result.success ? this._createSuccessContainer(result) : this._createErrorContainer(result.message, result.isPremiumLimit);

      if (result.success && result.showButtons && result.queuePosition) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const buttonRow   =this._createButtons(result.queuePosition - 1, guildId);
        container.addActionRowComponents(buttonRow);
      }

      const sentMessage   =await interaction.editReply({
        content: '',
        components: [container],
      });

      if (result.success && result.showButtons && result.queuePosition) {
        this._setupButtonCollector(sentMessage, guildId, client);
      }
    } catch (error) {
      client.logger?.error("PlayCommand", `Error updating interaction: ${error.message}`, error);
    }
  }

  _setupButtonCollector(message, guildId, client) {
    const filter   =(i)   => i.customId.endsWith(`_${guildId}`);
    const collector   =message.createMessageComponentCollector({ filter, time: 300_000, max: 1 });

    collector.on("collect", async (interaction)   => {
      try {
        await interaction.deferUpdate();

        const parts   =interaction.customId.split('_');
        parts.pop();
        const trackIndexStr   =parts.pop();
        const action   =parts.join('_');
        const trackIndex   =parseInt(trackIndexStr, 10);

        if (isNaN(trackIndex)) return;

        if (!interaction.member?.voice?.channel) return;

        const player   =client.music?.getPlayer(guildId);
        if (!player) return;

        const pm   =new PlayerManager(player);
        if (trackIndex < 0 || trackIndex >= player.queue.tracks.length) return;

        const track   =player.queue.tracks[trackIndex];
        let newContainer;

        switch (action) {
          case "play_now":
            await pm.moveTrack(trackIndex, 0);
            await pm.skip();
            newContainer   =this._createActionResultContainer("Track Updated", `Playing Now: ${track.info.title}`);
            break;
          case "play_next":
            await pm.moveTrack(trackIndex, 0);
            newContainer   =this._createActionResultContainer("Queue Updated", `Will Play Next: ${track.info.title}`);
            break;
          case "remove_track":
            await pm.removeTrack(trackIndex);
            newContainer   =this._createActionResultContainer("Track Removed", `Removed from Queue: ${track.info.title}`);
            break;
          default:
            return;
        }

        await interaction.editReply({ components: [newContainer] });

      } catch (error) {
        client.logger?.error("PlayCommand", `Error in button collector: ${error.message}`, error);
      }
    });

    collector.on("end", async (collected, reason)   => {
      if (reason   ==='limit') return;

      try {
        const currentMessage   =await message.fetch().catch(()   => null);
        if (!currentMessage?.components?.length) return;

        const originalComponents   =currentMessage.components[0]?.components;
        if (!originalComponents) return;

        const newContainer   =new ContainerBuilder();

        for (const component of originalComponents) {
          if (component.type   ===1) {
            continue;
          } else if (component.type   ===2) {
            newContainer.addTextDisplayComponents(component);
          } else if (component.type   ===3) {
            newContainer.addSeparatorComponents(component);
          } else if (component.type   ===4) {
            newContainer.addSectionComponents(component);
          }
        }

        await currentMessage.edit({
          components: [newContainer],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (error) {
        if (error.code   !==10008) {
          client.logger?.error("PlayCommand", `Error removing buttons after timeout: ${error.message}`, error);
        }
      }
    });
  }

  _createActionResultContainer(title, message) {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(title)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(message)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets.successIcon || config.assets.defaultTrackArtwork)
        )
    );

    return container;
  }

  _parseFlags(args) {
    const flags   ={ query: [], source: null, position: null };
    for (let i   =0; i < args.length; i++) {
      const arg   =args[i];
      if (arg   ==="--src" || arg   ==="--source") {
        if (i + 1 < args.length) flags.source   =args[++i];
      } else if (arg   ==="--pos" || arg   ==="--position") {
        if (i + 1 < args.length) {
          const pos   =parseInt(args[++i], 10);
          if (!isNaN(pos) && pos > 0) flags.position   =pos;
        }
      } else if (!arg.startsWith("--")) {
        flags.query.push(arg);
      }
    }
    return { query: flags.query.join(" "), source: flags.source, position: flags.position };
  }

  _normalizeSource(source) {
    const sourceMap   ={
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
    const seconds   =Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const minutes   =Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, "0");
    const hours   =Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }
}

export default new PlayCommand();
