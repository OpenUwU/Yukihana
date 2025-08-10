import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";

const LASTFM_API_KEY   ="91a37ab5999def738d2af6ef813bf1eb";
const LASTFM_BASE_URL   ="http://ws.audioscrobbler.com/2.0/";

class RecommendationsCommand extends Command {
  constructor() {
    super({
      name: "recommendations",
      description: "Get song recommendations based on what's currently playing",
      usage: "recommendations",
      aliases: ["rec", "recommend", "similar"],
      category: "music",
      examples: [
        "recommendations",
        "rec",
        "similar"
      ],
      cooldown: 10,
      voiceRequired: true,
      sameVoiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: "recommendations",
        description: "Get song recommendations based on what's currently playing",
      },
    });
  }

  async execute({ client, message, args }) {
    return this._handleRecommendations(client, message.guild.id, message);
  }

  async slashExecute({ client, interaction }) {
    return this._handleRecommendations(client, interaction.guild.id, interaction);
  }

  async _handleRecommendations(client, guildId, context) {
    const player   =client.music?.getPlayer(guildId);

    if (!player || !player.queue.current) {
      return this._reply(context, this._createErrorContainer("No song is currently playing."));
    }

    const currentTrack   =player.queue.current;

    if (this._isYouTubeSource(currentTrack)) {
      return this._reply(context, this._createErrorContainer("Recommendations are not available for YouTube tracks. Try playing from Spotify, Apple Music, or other sources."));
    }

    const loadingMessage   =await this._reply(context, this._createLoadingContainer(currentTrack));

    try {
      const recommendations   =await this._fetchRecommendations(currentTrack, client);

      if (!recommendations || recommendations.length   ===0) {
        const noResultsContainer   =this._createErrorContainer(`No recommendations found for "${currentTrack.info.title}" by ${currentTrack.info.author}.`);
        return this._updateMessage(loadingMessage, noResultsContainer, context);
      }

      const userId   =context.user?.id || context.author?.id;
      const container   =this._buildRecommendationsContainer(currentTrack, recommendations, guildId, userId);
      const message   =await this._updateMessage(loadingMessage, container, context);

      if (message) {
        this._setupCollector(message, client, context, recommendations);
      }
    } catch (error) {
      client.logger?.error("RecommendationsCommand", `Error fetching recommendations: ${error.message}`, error);
      const errorContainer   =this._createErrorContainer("Failed to fetch recommendations. Please try again later.");
      await this._updateMessage(loadingMessage, errorContainer, context);
    }
  }

  _isYouTubeSource(track) {
    const uri   =track.info.uri?.toLowerCase() || '';
    const sourceName   =track.info.sourceName?.toLowerCase() || '';

    return uri.includes('youtube.com') ||
           uri.includes('youtu.be') ||
           sourceName.includes('youtube') ||
           sourceName.includes('yt');
  }

  async _fetchRecommendations(track, client) {
    const artist   =track.info.author || '';
    const title   =track.info.title || '';

    if (!artist || !title) {
      throw new Error('Missing artist or track information');
    }

    const params   =new URLSearchParams({
      method: 'track.getsimilar',
      artist: artist,
      track: title,
      api_key: LASTFM_API_KEY,
      format: 'json',
      autocorrect: '1',
      limit: '6'
    });

    const url   =`${LASTFM_BASE_URL}?${params.toString()}`;

    const response   =await fetch(url);
    if (!response.ok) {
      throw new Error(`Last.fm API request failed: ${response.status}`);
    }

    const data   =await response.json();

    if (data.error) {
      throw new Error(`Last.fm API error: ${data.message}`);
    }

    const similarTracks   =data.similartracks?.track;
    if (!similarTracks) {
      return [];
    }

    const tracks   =Array.isArray(similarTracks) ? similarTracks : [similarTracks];

    const processedTracks   =[];
    for (let i   =0; i < Math.min(tracks.length, 6); i++) {
      const track   =tracks[i];
      const searchQuery   =`${track.artist?.name || track.artist} ${track.name}`;

      let thumbnail   =config.assets.defaultTrackArtwork;
      let trackInfo   =null;

      try {
        const searchResult   =await client.music.search(searchQuery, {
          source: "spsearch"
        });

        if (searchResult?.tracks?.length > 0) {
          trackInfo   =searchResult.tracks[0];
          thumbnail   =trackInfo.info.artworkUrl || config.assets.defaultTrackArtwork;
        }
      } catch (searchError) {
        logger.warn("RecommendationsCommand", `Failed to search for thumbnail: ${searchQuery}`, searchError);
      }

      processedTracks.push({
        name: track.name,
        artist: track.artist?.name || track.artist,
        url: track.url,
        match: parseFloat(track.match) || 0,
        duration: track.duration ? this._formatDuration(track.duration * 1000) : 'Unknown',
        image: thumbnail,
        trackInfo: trackInfo,
        index: i
      });
    }

    return processedTracks;
  }

  _buildRecommendationsContainer(currentTrack, recommendations, guildId, userId) {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Music Recommendations`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Based On:** [${currentTrack.info.title}](${currentTrack.info.uri})`),
          new TextDisplayBuilder().setContent(`*by ${currentTrack.info.author} | ${this._formatDuration(currentTrack.info.duration)}*`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(currentTrack.info.artworkUrl || config.assets.defaultTrackArtwork))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

    const premiumStatus   =this._getPremiumStatus(guildId, userId);
    const headerText   =`**Similar Tracks** (${recommendations.length} found)`;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerText)
    );

    recommendations.forEach((rec, index)   => {
      const matchPercentage   =Math.round(rec.match * 100);
      const metaInfo   =[rec.duration, `${matchPercentage}% match`].filter(Boolean).join(' | ');

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${index + 1}. [${rec.name}](${rec.url})**`),
            new TextDisplayBuilder().setContent(`*by ${rec.artist} | ${metaInfo}*`)
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(rec.image))
      );
    });

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

    if (premiumStatus.hasPremium) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`*Premium Queue: Up to ${premiumStatus.maxSongs} songs*`)
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`*Free Queue: Up to ${premiumStatus.maxSongs} songs | Upgrade for ${config.queue.maxSongs.premium} songs*`)
      );
    }

    container.addActionRowComponents(this._createSelectMenu(recommendations, guildId, userId));

    return container;
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
        ? `Premium queue is full! You can have up to **${premiumStatus.maxSongs}** songs in queue.`
        : `Free tier queue is full! You can have up to **${premiumStatus.maxSongs}** songs in queue.\n*Upgrade to premium for up to **${config.queue.maxSongs.premium}** songs!*`;

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

  _createSelectMenu(recommendations, guildId, userId) {
    if (recommendations.length   ===0) return new ActionRowBuilder();

    const maxSelections   =Math.min(recommendations.length, 6);
    const options   =recommendations.map((rec)   => ({
      label: rec.name.substring(0, 100),
      value: `${rec.index}`,
      description: `by ${rec.artist}`.substring(0, 100),
    }));

    return new ActionRowBuilder().addComponents(
      new SelectMenuBuilder()
        .setCustomId(`rec_play_${userId}`)
        .setPlaceholder(`Select up to ${maxSelections} songs to add to queue`)
        .setMinValues(1)
        .setMaxValues(maxSelections)
        .addOptions(options)
    );
  }

  async _setupCollector(message, guildId, client, context, recommendations) {
    const userId   =context.user?.id || context.author?.id;

    const filter   =(i)   => i.user.id   ===userId && i.customId.includes(userId);
    const collector   =message.createMessageComponentCollector({ filter, time: 300_000 });

    collector.on("collect", async (interaction)   => {
      if (!interaction.customId.includes('rec_play')) return;

      await interaction.deferUpdate();

      const voiceChannel   =interaction.member?.voice?.channel;
      if (!voiceChannel) {
        await interaction.followUp({ content: "You must be in a voice channel to play music.", ephemeral: true });
        return;
      }

      const player   =client.music.getPlayer(guildId) || (await client.music.createPlayer({
        guildId: guildId,
        textChannelId: interaction.channel.id,
        voiceChannelId: voiceChannel.id
      }));

      const pm   =new PlayerManager(player);
      if (!pm.isConnected) await pm.connect();

      const currentQueueSize   =pm.queue.tracks.length;
      const selectedCount   =interaction.values.length;

      const queueLimitCheck   =this._checkQueueLimit(currentQueueSize, selectedCount, guildId, userId);

      if (!queueLimitCheck.allowed) {
        await interaction.followUp({
          content: queueLimitCheck.message,
          ephemeral: true
        });
        return;
      }

      const indices   =interaction.values.map(v   => parseInt(v, 10));
      const tracksToPlay   =indices.map(i   => recommendations[i]).filter(Boolean);
      const actualTracksToAdd   =queueLimitCheck.canAddAll ? tracksToPlay : tracksToPlay.slice(0, queueLimitCheck.tracksToAdd);

      let addedCount   =0;
      const wasEmpty   =!pm.isPlaying && pm.queue.tracks.length   ===0;

      for (const rec of actualTracksToAdd) {
        let searchResult;

        if (rec.trackInfo) {
          searchResult = { tracks: [rec.trackInfo] };
        } else {
          const query = `${rec.artist} ${rec.name}`;
          searchResult = await client.music.search(query, {
            requester: interaction.user,
            source: "spsearch"
          });
        }

        if (searchResult?.tracks?.length > 0) {
          await pm.addTracks(searchResult.tracks[0]);
          addedCount++;
        }
      }

      if (wasEmpty && pm.queue.tracks.length > 0) {
        await pm.play();
      }

      let successMessage = `Added **${addedCount}** of **${tracksToPlay.length}** recommended songs to the queue.`;

      if (!queueLimitCheck.canAddAll) {
        const premiumStatus = queueLimitCheck.premiumStatus;
        const limitWarning = premiumStatus.hasPremium
          ? `\n*Premium queue limit reached*`
          : `\n*Free tier limit reached - upgrade for ${config.queue.maxSongs.premium} songs*`;
        successMessage += limitWarning;
      }

      await interaction.followUp({
        content: successMessage,
        ephemeral: true
      });
    });

    collector.on("end", async ()   => {
      try {
        const currentMessage   =await message.fetch().catch(()   => null);
        if (!currentMessage || currentMessage.components.length   ===0) return;

        const originalContainer   =currentMessage.components[0];
        const newContainer   =new ContainerBuilder();

        if (originalContainer.components) {
          for (const component of originalContainer.components) {
            if (component.type   ===1) {
              const disabledRow   =new ActionRowBuilder();
              for (const button of component.components) {
                if (button.type   ===2) {
                  const disabledButton   =new ButtonBuilder()
                    .setCustomId(button.custom_id || 'disabled')
                    .setLabel(button.label || 'Button')
                    .setStyle(button.style || ButtonStyle.Secondary)
                    .setDisabled(true);
                  disabledRow.addComponents(disabledButton);
                } else if (button.type   ===3) {
                  const disabledSelect   =SelectMenuBuilder.from(button).setDisabled(true);
                  disabledRow.addComponents(disabledSelect);
                }
              }
              newContainer.addActionRowComponents(disabledRow);
            } else {
              newContainer.components.push(component);
            }
          }
        }

        await currentMessage.edit({ components: [newContainer] });
      } catch (error) {
        if (error.code   !==10008) {
          client.logger?.error("RecommendationsCommand", `Error disabling components: ${error.message}`, error);
        }
      }
    });
  }

  _createLoadingContainer(currentTrack) {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Finding Recommendations`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Analyzing Track**`),
          new TextDisplayBuilder().setContent(`"${currentTrack.info.title}" by ${currentTrack.info.author}`),
          new TextDisplayBuilder().setContent(`*Searching for similar tracks...*`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(currentTrack.info.artworkUrl || config.assets.defaultThumbnail))
    );

    return container;
  }

  _createErrorContainer(message) {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Error`));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Unable to Get Recommendations**`),
          new TextDisplayBuilder().setContent(message)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
    );

    return container;
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return "Unknown";
    const seconds   =Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
    const minutes   =Math.floor((ms / (1000 * 60)) % 60).toString();
    const hours   =Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes.padStart(2, '0')}:${seconds}`;
    return `${minutes}:${seconds}`;
  }

  async _reply(context, container) {
    const payload   ={
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    try {
      if (context.replied || context.deferred) {
        return context.editReply(payload);
      }
      return context.reply(payload);
    } catch (e) {
      logger.error("RecommendationsCommand", "Failed to reply in Recommendations command:", e);
      return null;
    }
  }

  async _updateMessage(message, container, context) {
    try {
      if (context.replied || context.deferred) {
        return await context.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        return await message.edit({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (error) {
      logger.error("RecommendationsCommand", "Failed to update recommendations message:", error);
      return message;
    }
  }
}

export default new RecommendationsCommand();
