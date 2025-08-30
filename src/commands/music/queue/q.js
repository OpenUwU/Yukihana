import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  StringSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  ComponentType,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
const TRACKS_PER_PAGE = 5;

class QueueCommand extends Command {
  constructor() {
    super({
      name: "queue",
      description:
        "View and manage the song queue with pagination and interactive controls",
      usage: "queue [page]",
      aliases: ["q"],
      category: "music",
      examples: ["queue", "queue 2", "q 3"],
      cooldown: 5,
      voiceRequired: true,
      sameVoiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: "queue",
        description: "View and manage the song queue",
        options: [
          {
            name: "page",
            description: "The page number of the queue to view",
            type: 4,
            required: false,
            min_value: 1,
          },
        ],
      },
    });
  }

  async execute({ client, message, args }) {
    const page = args[0] ? parseInt(args[0], 10) : 1;
    return this._handleQueue(
      client,
      message.guild.id,
      message,
      isNaN(page) ? 1 : page,
    );
  }

  async slashExecute({ interaction, client }) {
    const page = interaction.options.getInteger("page") || 1;
    return this._handleQueue(client, interaction.guild.id, interaction, page);
  }

  async _handleQueue(client, guildId, context, page) {
    const player = client.music?.getPlayer(guildId);

    if (!player || !player.queue.current) {
      return this._reply(
        context,
        this._createErrorContainer("The queue is empty."),
      );
    }

    const userId = context.user?.id || context.author?.id;
    const message = await this._reply(
      context,
      this._buildQueueContainer(player, page, guildId, userId),
    );
    if (message) {
      this._setupCollector(message, client, guildId, page);
    }
  }

  _buildQueueContainer(player, page, guildId, userId) {
    const container = new ContainerBuilder();
    const current = player.queue.current;
    const tracks = player.queue.tracks;

    const maxPages = Math.ceil(tracks.length / TRACKS_PER_PAGE) || 1;
    page = Math.max(1, Math.min(page, maxPages));

    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const queueStatus = premiumStatus.hasPremium
      ? `Premium Queue (${tracks.length}/${premiumStatus.maxSongs})`
      : `Free Queue (${tracks.length}/${premiumStatus.maxSongs})`;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Music Queue`),
    );

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Now Playing**`),
          new TextDisplayBuilder().setContent(
            `[${current.info.title}](${current.info.uri}) - \`${this._formatDuration(current.info.duration)}\``,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            current.info.artworkUrl || config.assets.defaultTrackArtwork,
          ),
        ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`*${queueStatus}*`),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
    );

    if (tracks.length > 0) {
      const startIndex = (page - 1) * TRACKS_PER_PAGE;
      const paginatedTracks = tracks.slice(
        startIndex,
        startIndex + TRACKS_PER_PAGE,
      );

      const upNextText = premiumStatus.hasPremium
        ? `**Up Next** (${tracks.length} track${tracks.length > 1 ? "s" : ""} | Premium)`
        : `**Up Next** (${tracks.length} track${tracks.length > 1 ? "s" : ""} | Upgrade for ${config.queue.maxSongs.premium} song limit)`;

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(upNextText),
      );

      paginatedTracks.forEach((track, index) => {
        const trueIndex = startIndex + index;
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**${trueIndex + 1}.** [${track.info.title}](${track.info.uri})`,
              ),
              new TextDisplayBuilder().setContent(
                `*Added by ${track.requester?.username || "Unknown"} | ${this._formatDuration(track.info.duration)}*`,
              ),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(
                track.info.artworkUrl || config.assets.defaultTrackArtwork,
              ),
            ),
        );
      });

      container.addActionRowComponents(
        this._createRemoveMenu(paginatedTracks, startIndex, player.guildId),
      );
      container.addActionRowComponents(
        this._createPaginationButtons(page, maxPages, player.guildId),
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("*The queue is empty.*"),
      );
    }

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

  _createPaginationButtons(currentPage, maxPages, guildId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`q_page_${currentPage - 1}_${guildId}`)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId("q_info_button")
        .setLabel(`Page ${currentPage} of ${maxPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`q_page_${currentPage + 1}_${guildId}`)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= maxPages),
    );
  }

  _createRemoveMenu(tracksOnPage, startIndex, guildId) {
    if (tracksOnPage.length === 0) return new ActionRowBuilder();
    const options = tracksOnPage.map((track, index) => ({
      label: track.info.title.substring(0, 100),
      value: `${startIndex + index}`,
      description: `by ${track.info.author || "Unknown"}`.substring(0, 100),
    }));

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`q_remove_${guildId}`)
        .setPlaceholder("Select tracks to remove from this page")
        .setMinValues(1)
        .setMaxValues(options.length)
        .addOptions(options),
    );
  }

  async _setupCollector(message, client, guildId, initialPage) {
    const filter = (i) =>
      i.customId.startsWith("q_") && i.customId.endsWith(guildId);
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300_000,
    });

    let currentPage = initialPage;

    collector.on("collect", async (interaction) => {
      await interaction.deferUpdate();
      const player = client.music?.getPlayer(guildId);
      if (!player) {
        collector.stop();
        return;
      }

      const parts = interaction.customId.split("_");
      const action = parts[1];

      if (action === "page") {
        currentPage = parseInt(parts[2], 10);
        const newContainer = this._buildQueueContainer(player, currentPage);
        await interaction.editReply({ components: [newContainer] });
      } else if (action === "remove" && interaction.isSelectMenu()) {
        const pm = new PlayerManager(player);
        const indicesToRemove = interaction.values
          .map((v) => parseInt(v, 10))
          .sort((a, b) => b - a);

        for (const index of indicesToRemove) {
          if (index < player.queue.tracks.length) {
            await pm.queue.remove(index);
          }
        }

        const newTotalPages =
          Math.ceil(player.queue.tracks.length / TRACKS_PER_PAGE) || 1;
        currentPage = Math.min(currentPage, newTotalPages);

        const newContainer = this._buildQueueContainer(player, currentPage);
        await interaction.editReply({ components: [newContainer] });
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "limit" || reason === "messageDelete") return;

      try {
        const currentMessage = await this._fetchMessage(message).catch(
          () => null,
        );

        if (!currentMessage?.components?.length) {
          return;
        }

        const success = await this._disableAllComponents(
          currentMessage,
          client,
        );

        if (success) {
          logger.debug(
            "QueueCommand",
            `Components disabled successfully. Reason: ${reason}`,
          );
        }
      } catch (error) {
        this._handleDisableError(error, client, reason);
      }
    });
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
        "QueueCommand",
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
    const ignoredErrors = [10008, 10003, 50001];

    if (!ignoredErrors.includes(error.code)) {
      logger.error(
        "QueueCommand",
        `Error disabling components after ${reason}: ${error.message}`,
        {
          code: error.code,
          reason,
          stack: error.stack,
        },
      );
    } else {
      client.logger.debug(
        "QueueCommand",
        `Ignored error ${error.code} when disabling components: ${error.message}`,
      );
    }
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60).toString();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes.padStart(2, "0")}:${seconds}`;
    return `${minutes}:${seconds}`;
  }

  _createErrorContainer(message) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Error**\n*${message}*`),
    );
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    try {
      if (context.reply) {
        return context.reply(payload);
      } else {
        return context.reply(payload);
      }
    } catch (e) {
      logger.error("QueueCommand", "Failed to reply in Queue command:", e);
      return null;
    }
  }
}

export default new QueueCommand();
