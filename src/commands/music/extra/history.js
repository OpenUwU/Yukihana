import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";

const TRACKS_PER_PAGE   = 5;

class HistoryCommand extends Command {
  constructor() {
    super({
      name: "history",
      description: "View your personal listening history and re-play songs with interactive controls",
      usage: "history [page]",
      aliases: ["hist"],
      category: "music",
      examples: [
        "history",
        "history 2",
        "hist 3"
      ],
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "history",
        description: "View your listening history.",
        options: [{
          name: "page",
          description: "The page number of your history to view.",
          type: 4,
          required: false,
          min_value: 1,
          autocomplete: true
        }]
      },
    });
  }

  async execute({ client, message, args }) {
    const page   =args[0] ? parseInt(args[0], 10) : 1;
    return this._handleHistory(client, message.author.id, isNaN(page) ? 1 : page, message);
  }

  async slashExecute({ client, interaction }) {
    const page   =interaction.options.getInteger("page") || 1;
    return this._handleHistory(client, interaction.user.id, page, interaction);
  }

  async _handleHistory(client, userId, page, context) {
    logger.debug('HistoryCommand', '  ===HISTORY COMMAND DEBUG   ===');
    logger.debug('HistoryCommand', `User ID: ${userId}`);
    logger.debug('HistoryCommand', `User ID type: ${typeof userId}`);
    logger.debug('HistoryCommand', `Context user: ${context.user?.id || context.author?.id}`);

    const userExists   =db.user.getUser(userId);
    logger.debug('HistoryCommand', `User exists in DB: ${!!userExists}`);
    logger.debug('HistoryCommand', `User data: ${JSON.stringify(userExists)}`);

    let history   =db.user.getHistory(userId);
    logger.debug('HistoryCommand', `Raw history result: ${JSON.stringify(history)}`);
    logger.debug('HistoryCommand', `History length: ${history?.length || 0}`);
    logger.debug('HistoryCommand', `History type: ${typeof history}`);

    try {
      const directQuery   =db.user.get('SELECT history FROM users WHERE id   =?', [userId]);
      logger.debug('HistoryCommand', `Direct DB query result: ${JSON.stringify(directQuery)}`);
      if (directQuery?.history) {
        const parsedDirect   =JSON.parse(directQuery.history);
        logger.debug('HistoryCommand', `Direct parsed history: ${JSON.stringify(parsedDirect)}`);
        logger.debug('HistoryCommand', `Direct history length: ${parsedDirect.length}`);
      }
    } catch (e) {
      logger.debug('HistoryCommand', `Direct query error: ${e.message}`);
    }

    logger.debug('HistoryCommand', '  ===END DEBUG   ===');

    if (!history || history.length   ===0) {
      return this._reply(context, this._createErrorContainer("Your listening history is empty."));
    }

    const validHistory   =history.filter(track   => track && track.title && track.identifier);
    if (validHistory.length   !==history.length) {
      db.user.setUserHistory(userId, validHistory);
      history   =validHistory;
      logger.info('HistoryCommand', `Cleaned up ${history.length - validHistory.length} invalid entries for user ${userId}`);
    }

    if (history.length   ===0) {
      return this._reply(context, this._createErrorContainer("Your listening history is empty or contains only invalid entries."));
    }

    const maxPages   =Math.ceil(history.length / TRACKS_PER_PAGE) || 1;
    page   =Math.max(1, Math.min(page, maxPages));

    const container   =this._buildHistoryContainer(history, page, maxPages, userId, context.guild.id);
    const message   =await this._reply(context, container);

    if (message) {
      this._setupCollector(message, client, context);
    }
  }
  _buildHistoryContainer(history, page, maxPages, userId, guildId) {
    const container   =new ContainerBuilder();
    const startIndex   =(page - 1) * TRACKS_PER_PAGE;
    const paginatedTracks   =history.slice(startIndex, startIndex + TRACKS_PER_PAGE);
    const premiumStatus   =this._getPremiumStatus(guildId, userId);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Your Listening History`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Page ${page} of ${maxPages}**`),
          new TextDisplayBuilder().setContent(`*${history.length} total tracks in your history*`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork))
    );

    if (paginatedTracks.length > 0) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      paginatedTracks.forEach((track, index)   => {
        const trueIndex   =startIndex + index;
        const title   =track.title || 'Unknown Track';
        const author   =track.author || 'Unknown';
        const duration   =this._formatDuration(track.duration);

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${trueIndex + 1}. [${title}](${track.uri || '#'})**`),
              new TextDisplayBuilder().setContent(`*by ${author} | ${duration}*`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.artworkUrl || config.assets.defaultTrackArtwork))
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

      const selectMenu   =this._createSelectMenu(paginatedTracks, startIndex, userId);
      if (selectMenu.components.length > 0) {
        container.addActionRowComponents(selectMenu);
      }

      if (maxPages > 1) {
        container.addActionRowComponents(this._createPaginationButtons(page, maxPages, userId));
      }
    } else {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("*No history found on this page.*")
      );
    }

    return container;
  }

  _createSelectMenu(tracksOnPage, startIndex, userId) {
    if (tracksOnPage.length   ===0) return new ActionRowBuilder();

    const validTracks   =tracksOnPage.filter(track   => track && track.title && track.identifier);
    if (validTracks.length   ===0) return new ActionRowBuilder();

    const options   =validTracks.map((track, index)   => {
      const originalIndex   =tracksOnPage.findIndex(t   => t && t.identifier   ===track.identifier);
      return {
        label: (track.title || 'Unknown Track').substring(0, 100),
        value: `${startIndex + originalIndex}`,
        description: `by ${track.author || 'Unknown'}`.substring(0, 100),
      };
    });

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`hist_play_${userId}`)
        .setPlaceholder("Select up to 10 songs to add to queue")
        .setMinValues(1)
        .setMaxValues(Math.min(options.length, 10))
        .addOptions(options)
    );
  }

  _createPaginationButtons(currentPage, maxPages, userId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`hist_page_${currentPage - 1}_${userId}`)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage   ===1),
      new ButtonBuilder()
        .setCustomId('hist_info_button')
        .setLabel(`Page ${currentPage} of ${maxPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`hist_page_${currentPage + 1}_${userId}`)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= maxPages)
    );
  }

  async _setupCollector(message, client, context) {
    const userId   =context.user?.id || context.author?.id;
    const guildId   =context.guild.id;

    const filter   =(i)   => i.user.id   ===userId && i.customId.endsWith(userId);
    const collector   =message.createMessageComponentCollector({ filter, time: 300000 });

    let currentPage   =context.options?.getInteger("page") || (context.args?.[0] ? parseInt(context.args[0]) : 1) || 1;

    collector.on("collect", async (interaction)   => {
      const parts   =interaction.customId.split('_');
      const action   =parts[1];

      await interaction.deferUpdate();

      if (action   ==='page') {
        currentPage   =parseInt(parts[2], 10);
        let history   =db.user.getHistory(userId);

        const validHistory   =history.filter(track   => track && track.title && track.identifier);
        if (validHistory.length   !==history.length) {
          db.user.setUserHistory(userId, validHistory);
          history   =validHistory;
        }

        const maxPages   =Math.ceil(history.length / TRACKS_PER_PAGE) || 1;
        const newContainer   =this._buildHistoryContainer(history, currentPage, maxPages, userId, guildId);
        await interaction.editReply({ components: [newContainer] });

      } else if (action   ==='play' && interaction.isSelectMenu()) {
        const voiceChannel   =interaction.member?.voice?.channel;
        if (!voiceChannel) {
          await interaction.followUp({ content: "You must be in a voice channel to play music.", ephemeral: true });
          return;
        }

        const permissions   =voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has(['Connect', 'Speak'])) {
          await interaction.followUp({ content: "I need permission to join and speak in your voice channel.", ephemeral: true });
          return;
        }

        const player   =client.music.getPlayer(guildId) || (await client.music.createPlayer({
          guildId: guildId,
          textChannelId: interaction.channel.id,
          voiceChannelId: voiceChannel.id
        }));

        const pm   =new PlayerManager(player);
        if (!pm.isConnected) await pm.connect();

        const history   =db.user.getHistory(userId);
        const indices   =interaction.values.map(v   => parseInt(v, 10));
        const tracksToPlay   =indices.map(i   => history[i]).filter(Boolean);

        const currentQueueSize   =pm.queue.tracks.length;
        const queueLimitCheck   =this._checkQueueLimit(currentQueueSize, tracksToPlay.length, guildId, userId);

        if (!queueLimitCheck.allowed) {
          await interaction.followUp({ content: queueLimitCheck.message, ephemeral: true });
          return;
        }

        const tracksToAdd   =queueLimitCheck.canAddAll ? tracksToPlay : tracksToPlay.slice(0, queueLimitCheck.tracksToAdd);
        let addedCount = 0;

        for (const track of tracksToAdd) {
          try {
            const query = track.uri || track.title;
            const searchResult = await client.music.search(query, { 
              requester: interaction.user,
              source: "spsearch"
            });
            if (searchResult.tracks.length > 0) {
              await pm.addTracks(searchResult.tracks[0]);
              addedCount++;
            }
          } catch (error) {
            logger.error('HistoryCommand', `Failed to add track ${track.title} to queue`, error);
          }
        }

        if (!pm.isPlaying && pm.queue.tracks.length > 0) {
          await pm.play();
        }

        let responseMessage = `Added **${addedCount}** of **${tracksToPlay.length}** selected songs to the queue.`;

        if (!queueLimitCheck.canAddAll) {
          const premiumStatus = queueLimitCheck.premiumStatus;
          const limitWarning = premiumStatus.hasPremium 
            ? `\n*Premium queue limit reached*`
            : `\n*Free tier limit reached - upgrade for ${config.queue.maxSongs.premium} songs*`;
          responseMessage += limitWarning;
        }

        await interaction.followUp({ 
          content: responseMessage, 
          ephemeral: true 
        });
      }
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
              for (const child of component.components) {
                if (child.type   ===2) {
                  const disabledButton   =new ButtonBuilder()
                    .setCustomId(child.custom_id || 'disabled')
                    .setLabel(child.label || 'Button')
                    .setStyle(child.style || ButtonStyle.Secondary)
                    .setDisabled(true);
                  disabledRow.addComponents(disabledButton);
                } else if (child.type   ===3) {
                  const disabledSelect   =StringSelectMenuBuilder.from(child).setDisabled(true);
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
          logger.error("HistoryCommand", "Failed to disable history components:", error);
        }
      }
    });
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

  _getPremiumStatus(guildId, userId) {
    const premiumStatus   =db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : 'free',
      maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free
    };
  }

  _createErrorContainer(message) {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### History Error")
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("**Unable to Load History**"),
          new TextDisplayBuilder().setContent(message)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork))
    );

    return container;
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return "Live";
    const seconds   =Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const minutes   =Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, "0");
    const hours   =Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
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
      } else if (typeof context.reply   ==='function') {
        return context.reply(payload);
      } else {
        return context.channel.send(payload);
      }
    } catch (error) {
      logger.error('HistoryCommand', 'Error in _reply', error);
      return null;
    }
  }
}

export default new HistoryCommand();
