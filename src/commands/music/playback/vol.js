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
  ComponentType,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

class VolumeCommand extends Command {
  constructor() {
    super({
      name: "volume",
      description:
        "Adjust or view the music playback volume with an interactive control panel",
      usage: "volume [level]",
      aliases: ["v", "vol"],
      category: "music",
      examples: ["volume", "volume 50", "vol 100", "v 75"],
      cooldown: 2,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: "volume",
        description: "View or set the player volume",
        options: [
          {
            name: "level",
            description: "A number between 0 and 150",
            type: 4,
            required: false,
            min_value: 0,
            max_value: 150,
          },
        ],
      },
    });
  }

  async execute({ client, message, args, pm }) {
    const level = args[0] ? parseInt(args[0], 10) : undefined;
    return this._handleVolume(client, message, pm, level);
  }

  async slashExecute({ client, interaction, pm }) {
    const level = interaction.options.getInteger("level");
    return this._handleVolume(client, interaction, pm, level);
  }

  async _handleVolume(client, context, pm, level) {
    if (typeof level === "number") {
      if (isNaN(level) || level < 0 || level > 150) {
        return this._reply(
          context,
          this._createErrorContainer("Volume must be between 0 and 150."),
        );
      }
      await pm.setVolume(level);
    }

    const message = await this._reply(context, this._buildVolumeContainer(pm));
    if (message) {
      this._setupCollector(message, client, pm.guildId);
    }
  }

  _buildVolumeContainer(pm) {
    const container = new ContainerBuilder();
    const volume = pm.volume;
    const barLength = 15;
    const filledBlocks = Math.round((volume / 150) * barLength);
    const emptyBlocks = barLength - filledBlocks;
    const volumeBar = "█".repeat(filledBlocks) + "▒".repeat(emptyBlocks);
    const artworkUrl =
      pm.currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("music")} **Volume Control**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Current Settings**\n\n` +
      `├─ **${emoji.get("info")} Volume Level:** ${volume}%\n` +
      `├─ **${emoji.get("check")} Status:** ${volume === 0 ? "Muted" : "Active"}\n` +
      `├─ **${emoji.get("folder")} Range:** 0% - 150%\n` +
      `└─ **${emoji.get("reset")} Visual:** \`${volumeBar}\`\n\n` +
      `*Use the buttons below to adjust volume*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(artworkUrl)),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    container.addActionRowComponents(this._createButtons(pm));
    return container;
  }

  _createButtons(pm) {
    const volume = pm.volume;
    const isMuted = volume === 0;

    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vol_minus_10_${pm.guildId}`)
        .setLabel("-10")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(volume <= 0),
      new ButtonBuilder()
        .setCustomId(`vol_mute_${pm.guildId}`)
        .setLabel(isMuted ? "Unmute" : "Mute")
        .setStyle(isMuted ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`vol_plus_10_${pm.guildId}`)
        .setLabel("+10")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(volume >= 150),
    );
  }

  async _setupCollector(message, client, guildId) {
    const filter = (i) =>
      i.customId.startsWith("vol_") && i.customId.endsWith(guildId);
    const collector = message.createMessageComponentCollector({
      filter,
      time: 120_000,
    });

    collector.on("collect", async (interaction) => {
      await interaction.deferUpdate();
      const player = client.music?.getPlayer(guildId);
      if (!player) {
        collector.stop();
        return;
      }

      const pm = new PlayerManager(player);
      const action = interaction.customId.split("_")[1];

      switch (action) {
        case "minus":
          await pm.setVolume(Math.max(0, pm.volume - 10));
          break;
        case "plus":
          await pm.setVolume(Math.min(150, pm.volume + 10));
          break;
        case "mute":
          if (pm.volume > 0) {
            pm.setData("oldVolume", pm.volume);
            await pm.setVolume(0);
          } else {
            const oldVolume = pm.getData("oldVolume") || 100;
            await pm.setVolume(oldVolume);
          }
          break;
      }

      const newContainer = this._buildVolumeContainer(pm);
      await interaction.editReply({ components: [newContainer] });
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

        const success = await this._disableAllComponents(currentMessage);

        if (success) {
          logger.debug(
            "VolumeCommand",
            `Components disabled successfully. Reason: ${reason}`,
          );
        }
      } catch (error) {
        this._handleDisableError(error, reason);
      }
    });

    collector.on("dispose", async (interaction) => {
      logger.debug(
        "VolumeCommand",
        `Interaction disposed: ${interaction.customId}`,
      );
    });
  }

  async _disableAllComponents(message) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error) {
      logger.error(
        "VolumeCommand",
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

  _handleDisableError(error, reason) {
    if (error.code === 10008) {
      logger.debug(
        "VolumeCommand",
        `Message was deleted, cannot disable components. Reason: ${reason}`,
      );
    } else if (error.code === 50001) {
      logger.warn(
        "VolumeCommand",
        `Missing permissions to edit message. Reason: ${reason}`,
      );
    } else {
      logger.error(
        "VolumeCommand",
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

  _createErrorContainer(message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
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
            config.assets?.defaultThumbnail ||
              config.assets?.defaultTrackArtwork,
          ),
        ),
    );

    return container;
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    try {
      if (context.replied || context.deferred) {
        return context.followUp(payload);
      }
      return context.reply(payload);
    } catch (e) {
      logger.error("VolumeCommand", "Failed to reply in Volume command:", e);
      return null;
    }
  }
}

export default new VolumeCommand();