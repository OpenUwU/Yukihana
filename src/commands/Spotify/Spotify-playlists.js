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
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { spotifyManager } from "#utils/SpotifyManager";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

const PLAYLISTS_PER_PAGE = 5;
const TRACKS_PER_PAGE = 5;

class PlaylistsCommand extends Command {
  constructor() {
    super({
      name: "Spotify-playlists",
      description:
        "View and play your linked Spotify playlists with advanced navigation",
      usage: "playlists",
      aliases: ["sp-pl", "spotify-playlists", "sppl"],
      category: "music",
      examples: ["playlists", "pl"],
      cooldown: 5,
      voiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: ["spotify", "playlists"],
        description: "View and play your Spotify playlists",
        options: [],
      },
    });
  }

  async execute({ client, message }) {
    return this._handlePlaylists(client, message, "message");
  }

  async slashExecute({ client, interaction }) {
    return this._handlePlaylists(client, interaction, "interaction");
  }

  async _handlePlaylists(client, context) {
    try {
      const userId = context.user?.id || context.author?.id;
      const guild = context.guild;

      const spotifyProfile = db.user.getSpotifyProfile(userId);
      if (!spotifyProfile) {
        return this._reply(
          context,
          this._createNotLinkedContainer(),
        );
      }

      const loadingMessage = await this._reply(
        context,
        this._createLoadingContainer(),
      );

      const playlists = await spotifyManager.fetchUserPlaylists(
        spotifyProfile.profileUrl,
      );

      if (!playlists || playlists.length === 0) {
        return this._editReply(
          loadingMessage,
          this._createNoPlaylistsContainer(),
        );
      }

      const message = await this._editReply(
        loadingMessage,
        this._createPlaylistsContainer(playlists, 1),
      );

      if (message) {
        this._setupPlaylistsCollector(message, client, userId, playlists, guild);
      }
    } catch (error) {
      logger.error("PlaylistsCommand", "Error in _handlePlaylists", error);
      const errorContainer = this._createErrorContainer("An error occurred while fetching your playlists. Please try again.");

      if (context.replied || context.deferred) {
        await context.editReply({ components: [errorContainer] }).catch(() => {});
      } else {
        await this._reply(context, errorContainer).catch(() => {});
      }
    }
  }

  _createNotLinkedContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Spotify Playlists**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**No Spotify Profile Linked**\n\n` +
      `**${emoji.get('cross')} Status:** Not Connected\n\n` +
      `You need to link your Spotify profile to access your playlists.\n\n` +
      `**${emoji.get('add')} To get started:**\n` +
      `├─ Use \`link-spotify <profile_url>\`\n` +
      `├─ Get your profile URL from Spotify\n` +
      `├─ Make your playlists public\n` +
      `└─ Access all your playlists here\n\n` +
      `*Link your profile to view and play your playlists*`;

    const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createLoadingContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('loading')} **Loading Playlists**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Fetching Your Spotify Playlists**\n\n` +
      `**${emoji.get('loading')} Status:** Connecting to Spotify\n\n` +
      `Please wait while we fetch your public playlists from Spotify.\n\n` +
      `*This may take a few seconds...*`;

    const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createNoPlaylistsContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('cross')} **No Playlists Found**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**No Public Playlists Available**\n\n` +
      `**${emoji.get('cross')} Status:** No playlists found\n\n` +
      `No public playlists were found in your Spotify profile.\n\n` +
      `**${emoji.get('info')} To fix this:**\n` +
      `├─ Open Spotify and go to your playlists\n` +
      `├─ Right-click each playlist you want to use\n` +
      `├─ Select "Make public"\n` +
      `└─ Run this command again\n\n` +
      `**${emoji.get('reset')} Note:**\n` +
      `├─ Only public playlists can be accessed\n` +
      `├─ Private playlists won't appear here\n` +
      `└─ You can change playlist visibility anytime\n\n` +
      `*Make your playlists public to see them here*`;

    const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createPlaylistsContainer(playlists, page) {
    const container = new ContainerBuilder();
    const totalPages = Math.ceil(playlists.length / PLAYLISTS_PER_PAGE);
    const startIdx = (page - 1) * PLAYLISTS_PER_PAGE;
    const endIdx = startIdx + PLAYLISTS_PER_PAGE;
    const pagePlaylist = playlists.slice(startIdx, endIdx);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('folder')} **Your Spotify Playlists**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let playlistContent = `**Available Playlists**\n\n`;

    pagePlaylist.forEach((playlist, index) => {
      const globalIndex = startIdx + index + 1;
      playlistContent += `**${emoji.get('music')} ${globalIndex}.** ${playlist.name}\n`;
      playlistContent += `├─ **${emoji.get('info')} Tracks:** ${playlist.trackCount}\n`;
      playlistContent += `└─ **${emoji.get('check')} Owner:** ${playlist.owner || 'Unknown'}\n\n`;
    });

    playlistContent += `**${emoji.get('info')} Page Information:**\n` +
      `├─ **Current:** Page ${page} of ${totalPages}\n` +
      `├─ **Total Playlists:** ${playlists.length}\n` +
      `└─ **Showing:** ${pagePlaylist.length} playlists\n\n` +
      `*Select a playlist below to view tracks*`;

    const thumbnailUrl = pagePlaylist[0]?.coverUrl || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(playlistContent))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("playlist_select")
      .setPlaceholder("Choose a playlist to view tracks")
      .setMaxValues(1);

    pagePlaylist.forEach((playlist) => {
      selectMenu.addOptions({
        label: playlist.name.length > 100 ? playlist.name.slice(0, 97) + "..." : playlist.name,
        description: `${playlist.trackCount} tracks by ${playlist.owner || 'Unknown'}`,
        value: playlist.id,
        emoji: emoji.get('music').match(/:(\d+)>/)?.[1] ? { id: emoji.get('music').match(/:(\d+)>/)[1] } : undefined,
      });
    });

    const actionRow = new ActionRowBuilder().addComponents(selectMenu);
    container.addActionRowComponents(actionRow);

    if (totalPages > 1) {
      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("playlists_prev")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("left"))
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId("playlists_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("right"))
          .setDisabled(page >= totalPages),
      );

      container.addActionRowComponents(buttonRow);
    }

    return container;
  }

  _createPlaylistTracksContainer(playlist, tracks, page, totalPages) {
    const container = new ContainerBuilder();
    const startIdx = (page - 1) * TRACKS_PER_PAGE;
    const endIdx = startIdx + TRACKS_PER_PAGE;
    const pageTracks = tracks.slice(startIdx, endIdx);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('openfolder')} **${playlist.name}**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let tracksContent = `**Playlist Tracks**\n\n`;

    pageTracks.forEach((track, index) => {
      const globalIndex = startIdx + index + 1;
      const duration = track.duration ? this._formatDuration(track.duration) : 'Unknown';
      tracksContent += `**${emoji.get('music')} ${globalIndex}.** ${track.name}\n`;
      tracksContent += `├─ **${emoji.get('check')} Artist:** ${track.artist}\n`;
      tracksContent += `├─ **${emoji.get('folder')} Album:** ${track.album || 'Unknown'}\n`;
      tracksContent += `└─ **${emoji.get('info')} Duration:** ${duration}\n\n`;
    });

    tracksContent += `**${emoji.get('info')} Playlist Information:**\n` +
      `├─ **Owner:** ${playlist.owner || 'Unknown'}\n` +
      `├─ **Total Tracks:** ${tracks.length}\n` +
      `├─ **Current Page:** ${page} of ${totalPages}\n` +
      `└─ **Showing:** ${pageTracks.length} tracks\n\n` +
      `*Use the buttons below to navigate or play the playlist*`;

    const thumbnailUrl = playlist.coverUrl || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(tracksContent))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttonRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tracks_prev")
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("left"))
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId("tracks_next")
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("right"))
        .setDisabled(page >= totalPages),
      new ButtonBuilder()
        .setCustomId("play_playlist")
        .setLabel("Play Playlist")
        .setStyle(ButtonStyle.Success)
        .setEmoji(emoji.get("music")),
    );

    const buttonRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("back_to_playlists")
        .setLabel("Back to Playlists")
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji.get("reset")),
    );

    container.addActionRowComponents(buttonRow1, buttonRow2);

    return container;
  }

  _createProcessingContainer(playlistName, processedCount, totalCount) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('loading')} **Processing Playlist**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const progress = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

    const content = `**Adding Songs to Queue**\n\n` +
      `**${emoji.get('folder')} Playlist:** ${playlistName}\n` +
      `**${emoji.get('loading')} Progress:** ${processedCount}/${totalCount} tracks (${progress}%)\n` +
      `**${emoji.get('info')} Status:** Searching and adding tracks\n\n` +
      `**${emoji.get('check')} Process:**\n` +
      `├─ Searching each track on music sources\n` +
      `├─ Adding found tracks to queue\n` +
      `├─ Checking queue limits\n` +
      `└─ Applying premium/free tier restrictions\n\n` +
      `*Please wait while we process your playlist...*`;

    const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createSuccessContainer(playlist, addedCount, totalCount, failedCount, premiumStatus, limitWarning, wasPlaying) {
    const container = new ContainerBuilder();

    const title = wasPlaying ? "Playlist Playing" : "Playlist Queued";
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('check')} **${title}**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let statusText = wasPlaying ? "Started playing" : "Added to queue";

    const content = `**Playlist Successfully Processed**\n\n` +
      `**${emoji.get('folder')} Playlist:** ${playlist.name}\n` +
      `**${emoji.get('check')} Added:** ${addedCount} tracks\n` +
      `**${emoji.get('info')} Total:** ${totalCount} tracks\n` +
      `**${emoji.get('cross')} Failed:** ${failedCount} tracks\n` +
      `**${emoji.get('music')} Status:** ${statusText}\n\n` +
      `**${emoji.get('add')} Queue Information:**\n` +
      `├─ **Type:** ${premiumStatus.hasPremium ? 'Premium' : 'Free'}\n` +
      `├─ **Limit:** ${premiumStatus.maxSongs} songs maximum\n` +
      `└─ **Status:** ${premiumStatus.hasPremium ? 'Premium active' : 'Free tier'}\n\n` +
      `${limitWarning ? `**${emoji.get('info')} Notice:** ${limitWarning}\n\n` : ''}` +
      `${failedCount > 0 ? `*${failedCount} tracks could not be found on music sources*` : '*All tracks processed successfully*'}`;

    const thumbnailUrl = playlist.coverUrl || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createErrorContainer(message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('cross')} **Error**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createExpiredContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Interaction Expired**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**This interaction has expired**\n\n` +
      `**${emoji.get('reset')} Status:** Session timed out\n\n` +
      `Run the command again to view your Spotify playlists.\n\n` +
      `**${emoji.get('info')} Available Commands:**\n` +
      `├─ \`spotify-playlists\`\n` +
      `├─ \`sp-pl\`\n` +
      `└─ \`sppl\`\n\n` +
      `*Commands expire after 5 minutes of inactivity*`;

    const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
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
        ? `Premium queue is full (${premiumStatus.maxSongs} songs maximum)`
        : `Free tier queue is full (${premiumStatus.maxSongs} songs maximum). Upgrade to premium for ${config.queue.maxSongs.premium} songs`;

      return {
        allowed: false,
        message: limitMessage,
        currentSize: currentQueueSize,
        maxSize: premiumStatus.maxSongs,
        premiumStatus,
      };
    }

    const canAddAll = tracksToAdd <= availableSlots;
    const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;

    let limitWarning = null;
    if (!canAddAll) {
      limitWarning = premiumStatus.hasPremium
        ? `Only ${tracksToAddActual} of ${tracksToAdd} tracks added (premium queue limit reached)`
        : `Only ${tracksToAddActual} of ${tracksToAdd} tracks added. Upgrade to premium for ${config.queue.maxSongs.premium} song limit`;
    }

    return {
      allowed: true,
      canAddAll,
      tracksToAdd: tracksToAddActual,
      availableSlots,
      premiumStatus,
      limitWarning,
    };
  }

  _setupPlaylistsCollector(message, client, userId, playlists, guild) {
    const filter = (i) => i.user.id === userId;
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300000,
    });

    let currentPage = 1;
    let currentPlaylist = null;
    let currentTracks = null;
    let currentTracksPage = 1;

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();

        switch (interaction.customId) {
          case "playlists_prev":
            if (currentPage > 1) {
              currentPage--;
              await interaction.editReply({
                components: [this._createPlaylistsContainer(playlists, currentPage)],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            break;

          case "playlists_next": {
            const totalPlaylistPages = Math.ceil(playlists.length / PLAYLISTS_PER_PAGE);
            if (currentPage < totalPlaylistPages) {
              currentPage++;
              await interaction.editReply({
                components: [this._createPlaylistsContainer(playlists, currentPage)],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            break;
          }

          case "playlist_select": {
            const playlistId = interaction.values[0];
            currentPlaylist = playlists.find((p) => p.id === playlistId);

            if (!currentPlaylist) {
              await interaction.followUp({
                content: `${emoji.get('cross')} Playlist not found.`,
                ephemeral: true,
              });
              return;
            }

            try {
              currentTracks = await spotifyManager.fetchPlaylistTracks(playlistId);
              if (!currentTracks || currentTracks.length === 0) {
                await interaction.editReply({
                  components: [this._createErrorContainer(
                    `**No Playable Tracks Found**\n\nThe playlist "${currentPlaylist.name}" has no playable tracks or all tracks are local files.`
                  )],
                  flags: MessageFlags.IsComponentsV2,
                });
                return;
              }

              currentTracksPage = 1;
              const totalTracksPages = Math.ceil(currentTracks.length / TRACKS_PER_PAGE);

              await interaction.editReply({
                components: [this._createPlaylistTracksContainer(
                  currentPlaylist,
                  currentTracks,
                  currentTracksPage,
                  totalTracksPages,
                )],
                flags: MessageFlags.IsComponentsV2,
              });
            } catch (error) {
              logger.error("PlaylistsCommand", "Error fetching playlist tracks", error);
              await interaction.editReply({
                components: [this._createErrorContainer(
                  "**Error Loading Tracks**\n\nFailed to fetch playlist tracks. The playlist may be private or temporarily unavailable."
                )],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            break;
          }

          case "tracks_prev":
            if (currentTracksPage > 1) {
              currentTracksPage--;
              const totalTracksPages = Math.ceil(currentTracks.length / TRACKS_PER_PAGE);
              await interaction.editReply({
                components: [this._createPlaylistTracksContainer(
                  currentPlaylist,
                  currentTracks,
                  currentTracksPage,
                  totalTracksPages,
                )],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            break;

          case "tracks_next": {
            const totalTracksPages = Math.ceil(currentTracks.length / TRACKS_PER_PAGE);
            if (currentTracksPage < totalTracksPages) {
              currentTracksPage++;
              await interaction.editReply({
                components: [this._createPlaylistTracksContainer(
                  currentPlaylist,
                  currentTracks,
                  currentTracksPage,
                  totalTracksPages,
                )],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            break;
          }

          case "back_to_playlists":
            await interaction.editReply({
              components: [this._createPlaylistsContainer(playlists, currentPage)],
              flags: MessageFlags.IsComponentsV2,
            });
            break;

          case "play_playlist":
            await this._handlePlayPlaylist(
              interaction,
              client,
              guild,
              currentPlaylist,
              currentTracks,
              userId,
            );
            break;
        }
      } catch (error) {
        logger.error("PlaylistsCommand", "Error in collector", error);
        try {
          await interaction.followUp({
            content: `${emoji.get('cross')} An error occurred while processing your request. Please try again.`,
            ephemeral: true,
          });
        } catch (followUpError) {
          logger.error("PlaylistsCommand", "Error sending followup", followUpError);
        }
      }
    });

    collector.on("end", async () => {
      try {
        const expiredContainer = this._createExpiredContainer();
        await message.edit({ 
          components: [expiredContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (error) {
        if (error.code !== 10008) {
          logger.error("PlaylistsCommand", "Error updating expired message", error);
        }
      }
    });
  }

  async _handlePlayPlaylist(interaction, client, guild, playlist, tracks, userId) {
    try {
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        await interaction.editReply({
          components: [this._createErrorContainer(
            `**Voice Channel Required**\n\n${emoji.get('cross')} You need to join a voice channel to play music.\n\nJoin a voice channel and try again.`
          )],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      const permissions = voiceChannel.permissionsFor(guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        await interaction.editReply({
          components: [this._createErrorContainer(
            `**Missing Permissions**\n\n${emoji.get('cross')} I need permission to join and speak in your voice channel.\n\nPlease grant the necessary permissions and try again.`
          )],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      let player = client.music?.getPlayer(guild.id);
      const wasEmpty = !player || (player.queue.tracks.length === 0 && !player.playing);

      const currentQueueSize = wasEmpty ? 0 : (player?.queue.tracks.length || 0);
      const queueCheck = this._checkQueueLimit(currentQueueSize, tracks.length, guild.id, userId);

      if (!queueCheck.allowed) {
        await interaction.editReply({
          components: [this._createErrorContainer(
            `**Queue Limit Reached**\n\n${emoji.get('cross')} ${queueCheck.message}\n\nClear some songs from the queue or upgrade your plan.`
          )],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (!player) {
        player = await client.music.createPlayer({
          guildId: guild.id,
          textChannelId: interaction.channel.id,
          voiceChannelId: voiceChannel.id,
        });
      }

      const pm = new PlayerManager(player);
      if (!pm.isConnected) {
        await pm.connect();
      }

      const tracksToProcess = queueCheck.canAddAll ? tracks : tracks.slice(0, queueCheck.tracksToAdd);
      let addedCount = 0;
      let failedCount = 0;
      let lastUpdateTime = Date.now();

      await interaction.editReply({
        components: [this._createProcessingContainer(playlist.name, 0, tracksToProcess.length)],
        flags: MessageFlags.IsComponentsV2,
      });

      for (let i = 0; i < tracksToProcess.length; i++) {
        const track = tracksToProcess[i];

        try {
          const searchQuery = `${track.artist} ${track.name}`;
          const searchResult = await client.music.search(searchQuery, {
            source: 'spsearch',
            requester: interaction.user,
          });

          if (searchResult && searchResult.tracks && searchResult.tracks.length > 0) {
            const foundTrack = searchResult.tracks[0];
            await pm.addTracks(foundTrack);
            addedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          logger.error("PlaylistsCommand", `Error adding track: ${track.name}`, error);
          failedCount++;
        }

        if (Date.now() - lastUpdateTime > 3000) {
          try {
            await interaction.editReply({
              components: [this._createProcessingContainer(playlist.name, i + 1, tracksToProcess.length)],
              flags: MessageFlags.IsComponentsV2,
            });
            lastUpdateTime = Date.now();
          } catch (updateError) {
            logger.warn("PlaylistsCommand", "Could not update progress", updateError);
          }
        }

        if (i < tracksToProcess.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (wasEmpty && addedCount > 0) {
        await pm.play();
      }

      const premiumStatus = this._getPremiumStatus(guild.id, userId);

      await interaction.editReply({
        components: [this._createSuccessContainer(
          playlist,
          addedCount,
          tracks.length,
          failedCount,
          premiumStatus,
          queueCheck.limitWarning,
          wasEmpty && addedCount > 0
        )],
        flags: MessageFlags.IsComponentsV2,
      });

    } catch (error) {
      logger.error("PlaylistsCommand", "Error playing playlist", error);
      await interaction.editReply({
        components: [this._createErrorContainer(
          `**Error Processing Playlist**\n\n${emoji.get('cross')} Failed to add playlist to queue. This could be due to:\n\n├─ Network connectivity issues\n├─ Music service unavailability\n├─ Invalid track data\n└─ Player connection problems\n\nPlease try again in a moment.`
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return "Live";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };

    try {
      if (context.replied || context.deferred) {
        return context.editReply({ ...payload, fetchReply: true });
      } else if (typeof context.reply === "function") {
        return context.reply({ ...payload, fetchReply: true });
      } else {
        return context.channel.send(payload);
      }
    } catch (error) {
      logger.error("PlaylistsCommand", "Error in _reply", error);
      return null;
    }
  }

  async _editReply(message, container) {
    try {
      if (!message) return null;
      return message.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      logger.error("PlaylistsCommand", "Error in _editReply", error);
      return null;
    }
  }
}

export default new PlaylistsCommand();