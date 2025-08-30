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
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import emoji from "#config/emoji";

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
        "play https://www.youtube.com/watch?v=dQw4w9WgXcQ",
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
            description: "Position in queue to add the song (1 = next)",
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
      const focusedOption = interaction.options.getFocused(true);

      if (focusedOption.name === "query") {
        const query = focusedOption.value;

        if (!query || query.length < 2) {
          return interaction.respond([]);
        }

        if (this._isUrl(query)) {
          return interaction.respond([
            {
              name: `URL: ${query.substring(0, 90)}${query.length > 90 ? "..." : ""}`,
              value: query,
            },
          ]);
        }

        const source = interaction.options.getString("source") || "sp";
        const searchSource = this._normalizeSource(source);

        try {
          const searchResult = await client.music.search(query, {
            source: searchSource,
            limit: 10,
          });

          if (!searchResult || !searchResult.tracks?.length) {
            return interaction.respond([
              { name: `No results found for "${query}"`, value: query },
            ]);
          }

          const suggestions = searchResult.tracks.slice(0, 25).map((track) => {
            const title =
              track.info.title.length > 80
                ? track.info.title.substring(0, 77) + "..."
                : track.info.title;
            const author = track.info.author || "Unknown";
            const duration = this._formatDuration(track.info.duration);

            return {
              name: `${title} - ${author} (${duration})`,
              value: track.info.uri || track.info.title,
            };
          });

          await interaction.respond(suggestions);
        } catch (searchError) {
          logger.error(
            "PlayCommand",
            "Autocomplete search error:",
            searchError,
          );
          return interaction.respond([
            { name: `Search "${query}"`, value: query },
          ]);
        }
      }
    } catch (error) {
      logger.error("PlayCommand", "Autocomplete error:", error);
      try {
        await interaction.respond([]);
      } catch (e) {}
    }
  }

  async execute({ client, message, args }) {
    try {
      if (args.length === 0) {
        return message.reply({
          components: [
            this._createErrorContainer("Please provide a song name or URL."),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const { query, source, position } = this._parseFlags(args);

      if (!query.trim()) {
        return message.reply({
          components: [
            this._createErrorContainer("Please provide a song name or URL."),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply({
          components: [
            this._createErrorContainer("You must be in a voice channel."),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const permissions = voiceChannel.permissionsFor(message.guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        return message.reply({
          components: [
            this._createErrorContainer(
              "I need permission to join and speak in your voice channel.",
            ),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const loadingMessage = await message.reply({
        components: [this._createLoadingContainer(query)],
        flags: MessageFlags.IsComponentsV2,
      });

      const player =
        client.music.getPlayer(message.guild.id) ||
        (await client.music.createPlayer({
          guildId: message.guild.id,
          textChannelId: message.channel.id,
          voiceChannelId: voiceChannel.id,
        }));

      const pm = new PlayerManager(player);

      const result = await this._handlePlayRequest({
        client,
        guildId: message.guild.id,
        query,
        source,
        requester: message.author,
        position,
        pm,
      });

      await this._updateMessage(
        loadingMessage,
        result,
        message.guild.id,
        client,
        message.author.id,
      );
    } catch (error) {
      client.logger?.error(
        "PlayCommand",
        `Error in prefix command: ${error.message}`,
        error,
      );
      const errorContainer = this._createErrorContainer(
        "An error occurred. Please try again.",
      );
      if (message) {
        await message
          .reply({
            components: [errorContainer],
            flags: MessageFlags.IsComponentsV2,
          })
          .catch(() => {});
      }
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const query = interaction.options.getString("query");
      const source = interaction.options.getString("source");
      const position = interaction.options.getInteger("position");

      if (!query) {
        return interaction.reply({
          components: [
            this._createErrorContainer("Please provide a song name or URL."),
          ],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          components: [
            this._createErrorContainer("You must be in a voice channel."),
          ],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const permissions = voiceChannel.permissionsFor(
        interaction.guild.members.me,
      );
      if (!permissions.has(["Connect", "Speak"])) {
        return interaction.reply({
          components: [
            this._createErrorContainer(
              "I need permission to join and speak in your voice channel.",
            ),
          ],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

       await interaction.reply({
        components: [this._createLoadingContainer(query)],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

      const player =
        client.music.getPlayer(interaction.guild.id) ||
        (await client.music.createPlayer({
          guildId: interaction.guild.id,
          textChannelId: interaction.channel.id,
          voiceChannelId: voiceChannel.id,
        }));

      const pm = new PlayerManager(player);

      const result = await this._handlePlayRequest({
        client,
        guildId: interaction.guild.id,
        query,
        source,
        requester: interaction.user,
        position,
        pm,
      });

      await this._updateInteraction(
        interaction,
        result,
        interaction.guild.id,
        client,
        interaction.user.id,
      );
    } catch (error) {
      client.logger?.error(
        "PlayCommand",
        `Error in slash command: ${error.message}`,
        error,
      );
      const errorContainer = this._createErrorContainer(
        "An error occurred. Please try again.",
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ components: [errorContainer] });
        } else {
          await interaction.reply({
            components: [errorContainer],
            ephemeral: true,
          });
        }
      } catch (e) {}
    }
  }

  async _handlePlayRequest({
    client,
    guildId,
    query,
    source,
    requester,
    position,
    pm,
  }) {
    try {
      if (!pm.isConnected) {
        await pm.connect();
      }

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
        return this._handlePlaylist(
          pm,
          searchResult,
          position,
          guildId,
          requester.id,
        );
      } else {
        return this._handleSingleTrack(
          pm,
          searchResult.tracks[0],
          position,
          guildId,
          requester.id,
        );
      }
    } catch (error) {
      client.logger?.error(
        "PlayCommand",
        `Error handling play request: ${error.message}`,
        error,
      );
      return {
        success: false,
        message: "An error occurred while processing your request.",
      };
    }
  }

  async _handleSingleTrack(playerManager, track, position, guildId, userId) {
    const wasEmpty =
      playerManager.queue.tracks.length === 0 && !playerManager.isPlaying;

    const currentQueueSize = wasEmpty ? 0 : playerManager.queue.tracks.length;
    const queueLimitCheck = this._checkQueueLimit(
      currentQueueSize,
      1,
      guildId,
      userId,
    );

    if (!queueLimitCheck.allowed) {
      return {
        success: false,
        message: queueLimitCheck.message,
        isPremiumLimit: true,
      };
    }

    await playerManager.addTracks(track, position ? position - 1 : undefined);

    if (wasEmpty) {
      await playerManager.play();
      return { success: true, type: "playing", track };
    } else {
      const queuePosition = position || playerManager.queue.tracks.length;
      const premiumStatus = this._getPremiumStatus(guildId, userId);
      return {
        success: true,
        type: "queued",
        track,
        queuePosition,
        showButtons: true,
        premiumStatus,
      };
    }
  }

  async _handlePlaylist(
    playerManager,
    searchResult,
    position,
    guildId,
    userId,
  ) {
    const tracks = searchResult.tracks;
    const wasEmpty =
      playerManager.queue.tracks.length === 0 && !playerManager.isPlaying;

    const currentQueueSize = wasEmpty ? 0 : playerManager.queue.tracks.length;
    const queueLimitCheck = this._checkQueueLimit(
      currentQueueSize,
      tracks.length,
      guildId,
      userId,
    );

    if (!queueLimitCheck.allowed) {
      return {
        success: false,
        message: queueLimitCheck.message,
        isPremiumLimit: true,
      };
    }

    if (!queueLimitCheck.canAddAll) {
      const tracksToAdd = tracks.slice(0, queueLimitCheck.tracksToAdd);
      await playerManager.addTracks(
        tracksToAdd,
        position ? position - 1 : undefined,
      );

      const premiumStatus = queueLimitCheck.premiumStatus;
      const limitWarning = premiumStatus.hasPremium
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
          premiumStatus,
        };
      } else {
        return {
          success: true,
          type: "playlist_queued_partial",
          playlist: searchResult.playlist,
          tracks: tracksToAdd,
          totalTracks: tracks.length,
          limitWarning,
          premiumStatus,
        };
      }
    }

    await playerManager.addTracks(tracks, position ? position - 1 : undefined);

    if (wasEmpty) {
      await playerManager.play();
      return {
        success: true,
        type: "playlist_playing",
        playlist: searchResult.playlist,
        tracks: tracks,
      };
    } else {
      const premiumStatus = this._getPremiumStatus(guildId, userId);
      return {
        success: true,
        type: "playlist_queued",
        playlist: searchResult.playlist,
        tracks: tracks,
        premiumStatus,
      };
    }
  }

  _getPremiumStatus(guildId, userId) {
    const premiumStatus = db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : "free",
      maxSongs: premiumStatus
        ? config.queue.maxSongs.premium
        : config.queue.maxSongs.free,
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
        isPremium: premiumStatus.hasPremium,
      };
    }

    const canAddAll = tracksToAdd <= availableSlots;
    const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;

    return {
      allowed: true,
      canAddAll,
      tracksToAdd: tracksToAddActual,
      availableSlots,
      premiumStatus,
    };
  }

  _createLoadingContainer(query) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("loading")} **Music Search**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Searching for music...**\n\n` +
      `├─ **${emoji.get("music")} Query:** ${query}\n` +
      `├─ **${emoji.get("folder")} Sources:** Spotify, YouTube, Apple Music\n` +
      `└─ **${emoji.get("info")} Status:** Processing search request\n\n` +
      `*Please wait while we find your music*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets.searchIcon || config.assets.defaultTrackArtwork,
          ),
        ),
    );

    return container;
  }

  _createErrorContainer(message, isPremiumLimit = false) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("cross")} **${isPremiumLimit ? "Queue Limit" : "Error"}**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Something went wrong**\n\n` +
      `├─ **${emoji.get("info")} Issue:** ${message}\n` +
      `└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n` +
      `*Please check your input and try again*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets.errorIcon || config.assets.defaultTrackArtwork,
          ),
        ),
    );

    return container;
  }

  _createSuccessContainer(result) {
    const container = new ContainerBuilder();

    if (result.type === "playing" || result.type === "queued") {
      const { track, premiumStatus } = result;
      const title =
        result.type === "playing" ? "Now Playing" : "Added to Queue";

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("music")} **${title}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const content =
        `**Track Information**\n\n` +
        `├─ **${emoji.get("check")} Title:** ${track.info.title}\n` +
        `├─ **${emoji.get("folder")} Artist:** ${track.info.author || "Unknown"}\n` +
        `├─ **${emoji.get("info")} Duration:** ${this._formatDuration(track.info.duration)}\n` +
        `└─ **${emoji.get("add")} Status:** ${result.type === "playing" ? "Now playing" : `Position ${result.queuePosition || 0}`}\n\n` +
        `${result.type === "playing" ? "*Currently streaming in voice channel*" : "*Track has been queued successfully*"}`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              track.info.artworkUrl || config.assets.defaultTrackArtwork,
            ),
          ),
      );

      if (result.type === "queued" && premiumStatus) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );

        const statusContent =
          `**Queue Information**\n\n` +
          `├─ **${emoji.get("add")} Position:** ${result.queuePosition || 0}\n` +
          `├─ **${emoji.get("folder")} Queue Type:** ${premiumStatus.hasPremium ? "Premium" : "Free"}\n` +
          `├─ **${emoji.get("info")} Usage:** ${result.queuePosition || 0}/${premiumStatus.maxSongs} songs\n` +
          `└─ **${emoji.get("check")} Status:** ${premiumStatus.hasPremium ? "Premium active" : "Free tier"}\n\n` +
          `${!premiumStatus.hasPremium ? `*Upgrade to premium for ${config.queue.maxSongs.premium} song limit*` : "*Premium features unlocked*"}`;

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(statusContent),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(
                config.assets.queueIcon || config.assets.defaultTrackArtwork,
              ),
            ),
        );
      }
    } else if (result.type.startsWith("playlist")) {
      const { playlist, tracks, premiumStatus, limitWarning, totalTracks } =
        result;
      const trackCount = tracks.length;

      let title, description;
      if (result.type === "playlist_playing") {
        title = "Playing Playlist";
        description = "Started playlist playback";
      } else if (result.type === "playlist_playing_partial") {
        title = "Playing Playlist";
        description = "Partial playlist loaded";
      } else if (result.type === "playlist_queued_partial") {
        title = "Queued Playlist";
        description = "Partial playlist queued";
      } else {
        title = "Queued Playlist";
        description = "Playlist added to queue";
      }

      const firstTrackArt = tracks[0]?.info?.artworkUrl;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("folder")} **${title}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const content =
        `**Playlist Information**\n\n` +
        `├─ **${emoji.get("check")} Name:** ${playlist.name}\n` +
        `├─ **${emoji.get("add")} Tracks Added:** ${trackCount}\n` +
        `├─ **${emoji.get("info")} Total Tracks:** ${totalTracks || trackCount}\n` +
        `└─ **${emoji.get("folder")} Status:** ${description}\n\n` +
        `${limitWarning || "*All tracks processed successfully*"}`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              firstTrackArt || config.assets.defaultTrackArtwork,
            ),
          ),
      );

      if (
        (result.type === "playlist_queued" ||
          result.type === "playlist_queued_partial" ||
          result.type === "playlist_playing_partial") &&
        premiumStatus
      ) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );

        const statusContent =
          `**Queue Status**\n\n` +
          `├─ **${emoji.get("folder")} Queue Type:** ${premiumStatus.hasPremium ? "Premium" : "Free"}\n` +
          `├─ **${emoji.get("info")} Limit:** ${premiumStatus.maxSongs} songs maximum\n` +
          `└─ **${emoji.get("check")} Status:** ${premiumStatus.hasPremium ? "Premium active" : "Free tier active"}\n\n` +
          `${!premiumStatus.hasPremium ? `*Upgrade to premium for ${config.queue.maxSongs.premium} song limit*` : "*Premium queue features enabled*"}`;

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(statusContent),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(
                config.assets.premiumIcon || config.assets.defaultTrackArtwork,
              ),
            ),
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
        .setStyle(ButtonStyle.Danger),
    );
  }

  async _updateMessage(message, result, guildId, client, userId) {
    try {
      const container = result.success
        ? this._createSuccessContainer(result)
        : this._createErrorContainer(result.message, result.isPremiumLimit);

      if (result.success && result.showButtons && result.queuePosition) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );

        const buttonRow = this._createButtons(
          result.queuePosition - 1,
          guildId,
        );
        container.addActionRowComponents(buttonRow);
      }

      await message.edit({
        content: "",
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      if (result.success && result.showButtons && result.queuePosition) {
        this._setupButtonCollector(message, guildId, client, userId);
      }
    } catch (error) {
      client.logger?.error(
        "PlayCommand",
        `Error updating message: ${error.message}`,
        error,
      );
    }
  }

  async _updateInteraction(interaction, result, guildId, client, userId) {
    try {
      const container = result.success
        ? this._createSuccessContainer(result)
        : this._createErrorContainer(result.message, result.isPremiumLimit);

      if (result.success && result.showButtons && result.queuePosition) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );

        const buttonRow = this._createButtons(
          result.queuePosition - 1,
          guildId,
        );
        container.addActionRowComponents(buttonRow);
      }

      await interaction.editReply({
        content: "",
        components: [container],
      });

      if (result.success && result.showButtons && result.queuePosition) {
        this._setupButtonCollector(interaction, guildId, client, userId);
      }
    } catch (error) {
      client.logger?.error(
        "PlayCommand",
        `Error updating interaction: ${error.message}`,
        error,
      );
    }
  }

  _setupButtonCollector(messageOrInteraction, guildId, client, userId) {
    const message = messageOrInteraction.fetchReply
      ? messageOrInteraction
      : messageOrInteraction;
    const filter = (i) =>
      i.user.id === userId && i.customId.endsWith(`_${guildId}`);
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300_000,
      max: 1,
      dispose: true,
    });

    collector.on("collect", async (interaction) => {
      let actionCompleted = false;

      try {
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        if (parts.length < 3) {
          client.logger?.warn(
            "PlayCommand",
            `Invalid customId format: ${interaction.customId}`,
          );
          return;
        }

        parts.pop();
        const trackIndexStr = parts.pop();
        const action = parts.join("_");

        const trackIndex = parseInt(trackIndexStr, 10);
        if (isNaN(trackIndex)) {
          client.logger?.warn(
            "PlayCommand",
            `Invalid track index: ${trackIndexStr}`,
          );
          return;
        }

        if (!interaction.member?.voice?.channel) {
          await interaction
            .followUp({
              content: "You must be in a voice channel to use this action.",
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        const player = client.music?.getPlayer(guildId);
        if (!player) {
          await interaction
            .followUp({
              content: "No active music player found.",
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        const pm = new PlayerManager(player);

        if (trackIndex < 0 || trackIndex >= player.queue.tracks.length) {
          await interaction
            .followUp({
              content: "Track no longer exists in queue.",
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        const track = player.queue.tracks[trackIndex];
        let newContainer;
        let actionMessage;

        switch (action) {
          case "play_now":
            await pm.moveTrack(trackIndex, 0);
            await pm.skip();
            actionMessage = `Now playing: ${track.info.title}`;
            newContainer = this._createActionResultContainer(
              "Track Updated",
              actionMessage,
            );
            actionCompleted = true;
            break;

          case "play_next":
            await pm.moveTrack(trackIndex, 0);
            actionMessage = `Will play next: ${track.info.title}`;
            newContainer = this._createActionResultContainer(
              "Queue Updated",
              actionMessage,
            );
            actionCompleted = true;
            break;

          case "remove_track":
            await pm.removeTrack(trackIndex);
            actionMessage = `Removed: ${track.info.title}`;
            newContainer = this._createActionResultContainer(
              "Track Removed",
              actionMessage,
            );
            actionCompleted = true;
            break;

          default:
            client.logger?.warn("PlayCommand", `Unknown action: ${action}`);
            await interaction
              .followUp({
                content: "Unknown action requested.",
                ephemeral: true,
              })
              .catch(() => {});
            return;
        }

        if (actionCompleted && newContainer) {
          await interaction.editReply({
            components: [newContainer],
            flags: MessageFlags.IsComponentsV2,
          });

          client.logger?.debug(
            "PlayCommand",
            `Action completed: ${action} for track ${trackIndex}`,
          );
        }
      } catch (error) {
        client.logger?.error(
          "PlayCommand",
          `Error in button collector: ${error.message}`,
          error,
        );

        try {
          if (!actionCompleted) {
            await interaction.followUp({
              content:
                "An error occurred while processing your request. Please try again.",
              ephemeral: true,
            });
          }
        } catch (followUpError) {
          client.logger?.error(
            "PlayCommand",
            `Error sending followup: ${followUpError.message}`,
          );
        }
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "limit" || reason === "messageDelete") return;

      try {
        const currentMessage = await this._fetchMessage(message).catch(
          () => null,
        );

        if (!currentMessage?.components?.length) {
          client.logger?.debug(
            "PlayCommand",
            "No message or components found for disabling",
          );
          return;
        }

        const success = await this._disableAllComponents(
          currentMessage,
          client,
        );

        if (success) {
          client.logger?.debug(
            "PlayCommand",
            `Components disabled successfully. Reason: ${reason}`,
          );
        }
      } catch (error) {
        this._handleDisableError(error, client, reason);
      }
    });

    collector.on("dispose", async (interaction) => {
      client.logger?.debug(
        "PlayCommand",
        `Interaction disposed: ${interaction.customId}`,
      );
    });
  }

  async _disableAllComponents(message, client) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error) {
      client.logger?.error(
        "PlayCommand",
        `Failed to disable components: ${error.message}`,
        error,
      );
      return false;
    }
  }

  _processComponents(components) {
    return components.map((component) => {
      if (component.type === ComponentType.ActionRow) {
        return {
          ...component.toJSON(),
          components: component.components.map((subComponent) => ({
            ...subComponent.toJSON(),
            disabled: true,
          })),
        };
      }

      if (component.type === ComponentType.Container) {
        return {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };
      }

      if (component.type === ComponentType.Section) {
        const processedComponent = {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };

        if (
          component.accessory &&
          component.accessory.type === ComponentType.Button
        ) {
          processedComponent.accessory = {
            ...component.accessory.toJSON(),
            disabled: true,
          };
        }

        return processedComponent;
      }

      return component.toJSON();
    });
  }

  _handleDisableError(error, client, reason) {
    if (error.code === 10008) {
      // Unknown Message
      client.logger?.debug(
        "PlayCommand",
        `Message was deleted, cannot disable components. Reason: ${reason}`,
      );
    } else if (error.code === 50001) {
      // Missing Access
      client.logger?.warn(
        "PlayCommand",
        `Missing permissions to edit message. Reason: ${reason}`,
      );
    } else {
      client.logger?.error(
        "PlayCommand",
        `Error disabling components: ${error.message}. Reason: ${reason}`,
        error,
      );
    }
  }
  async _fetchMessage(messageOrInteraction) {
    if (messageOrInteraction.fetchReply) {
      return await messageOrInteraction.fetchReply();
    } else if (messageOrInteraction.fetch) {
      return await messageOrInteraction.fetch();
    } else {
      return messageOrInteraction;
    }
  }

  async _disableComponents(currentMessage, client) {
    try {
      const containerComponent = currentMessage.components.find(
        (c) => c.type === ComponentType.Container,
      );

      if (!containerComponent) {
        client.logger?.debug("PlayCommand", "No container component found");
        return false;
      }

      let container;
      try {
        container = ContainerBuilder.from(containerComponent);
      } catch (containerError) {
        client.logger?.error(
          "PlayCommand",
          `Failed to create ContainerBuilder: ${containerError.message}`,
        );
        return false;
      }

      let componentsModified = false;

      for (const comp of container.components) {
        if (comp instanceof ActionRowBuilder) {
          comp.components.forEach((inner) => {
            if (this._shouldDisableComponent(inner)) {
              inner.setDisabled(true);
              componentsModified = true;
            }
          });
        } else if (comp instanceof SectionBuilder && comp.accessory?.data) {
          if (
            comp.accessory.data.type === ComponentType.Button &&
            comp.accessory.data.style !== ButtonStyle.Link
          ) {
            comp.accessory.data.disabled = true;
            componentsModified = true;
          }
        }
      }

      if (componentsModified) {
        await currentMessage.edit({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        return true;
      }

      return false;
    } catch (error) {
      throw error;
    }
  }

  _shouldDisableComponent(component) {
    const selectMenuTypes = [
      StringSelectMenuBuilder,
      UserSelectMenuBuilder,
      RoleSelectMenuBuilder,
      ChannelSelectMenuBuilder,
      MentionableSelectMenuBuilder,
    ];

    if (selectMenuTypes.some((type) => component instanceof type)) {
      return true;
    }

    if (component instanceof ButtonBuilder) {
      return component.data.style !== ButtonStyle.Link;
    }

    return false;
  }

  _handleDisableError(error, client, reason) {
    const ignoredErrors = [10008, 10003, 50001];

    if (!ignoredErrors.includes(error.code)) {
      client.logger?.error(
        "PlayCommand",
        `Error disabling components after ${reason}: ${error.message}`,
        {
          code: error.code,
          reason,
          stack: error.stack,
        },
      );
    } else {
      client.logger?.debug(
        "PlayCommand",
        `Ignored error ${error.code} when disabling components: ${error.message}`,
      );
    }
  }

  _createActionResultContainer(title, message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("check")} **${title}**`),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Action Completed**\n\n` +
      `├─ **${emoji.get("info")} Result:** ${message}\n` +
      `└─ **${emoji.get("check")} Status:** Successfully processed\n\n` +
      `*Action has been executed*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets.successIcon || config.assets.defaultTrackArtwork,
          ),
        ),
    );

    return container;
  }

  _parseFlags(args) {
    const flags = { query: [], source: null, position: null };
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--src" || arg === "--source") {
        if (i + 1 < args.length) flags.source = args[++i];
      } else if (arg === "--pos" || arg === "--position") {
        if (i + 1 < args.length) {
          const pos = parseInt(args[++i], 10);
          if (!isNaN(pos) && pos > 0) flags.position = pos;
        }
      } else if (!arg.startsWith("--")) {
        flags.query.push(arg);
      }
    }
    return {
      query: flags.query.join(" "),
      source: flags.source,
      position: flags.position,
    };
  }

  _normalizeSource(source) {
    const sourceMap = {
      yt: "ytsearch",
      youtube: "ytsearch",
      sp: "spsearch",
      spotify: "spsearch",
      am: "amsearch",
      apple: "amsearch",
      sc: "scsearch",
      soundcloud: "scsearch",
      dz: "dzsearch",
      deezer: "dzsearch",
      js: "jssearch",
      jiosaavn: "jssearch",
      saavn: "jssearch",
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
    const seconds = Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
      .toString()
      .padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }
}

export default new PlayCommand();
