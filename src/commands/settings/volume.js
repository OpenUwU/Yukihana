import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";

class SetDefaultVolumeCommand extends Command {
  constructor() {
    super({
      name: "setdefaultvolume",
      description: "Set the default volume for new music players in this server",
      usage: "setdefaultvolume [volume]",
      aliases: [ "defaultvolume", "setdefvol"],
      category: "settings",
      examples: [
        "setdefaultvolume 50",
        "setdefaultvolume 100",
        "defaultvolume 25"
      ],
      cooldown: 3,
      userPermissions: [PermissionFlagsBits.ManageMessages],
      permissions: [PermissionFlagsBits.SendMessages],
      enabledSlash: true,
      slashData: {
        name: "setdefaultvolume",
        description: "Set the default volume for new music players in this server",
        options: [{
          name: "volume",
          description: "Volume level (1-100). Leave empty to view current setting.",
          type: 4,
          required: false,
          min_value: 1,
          max_value: 100,
        }],
      },
    });
  }

  async execute({ message, args }) {
    const volume = args[0] ? parseInt(args[0]) : null;
    await this._handleCommand(message, volume);
  }

  async slashExecute({ interaction }) {
    const volume = interaction.options.getInteger("volume");
    await this._handleCommand(interaction, volume);
  }

  async _handleCommand(ctx, volume) {
    const isInteraction = !!ctx.user;
    const user = isInteraction ? ctx.user : ctx.author;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator) && !config.ownerIds.includes(user.id)) {
      return this._sendError(ctx, "Permission Denied", "Only server administrators can change the default volume setting.");
    }

    if (volume !== null) {
      if (isNaN(volume) || volume < 1 || volume > 100) {
        return this._sendError(ctx, "Invalid Volume", "Volume must be a number between 1 and 100.");
      }
      await this._setDefaultVolume(ctx, volume);
    } else {
      await this._showVolumeSettings(ctx);
    }
  }

  async _setDefaultVolume(ctx, volume) {
    try {
      db.guild.setDefaultVolume(ctx.guild.id, volume);

      const container = this._createSuccessContainer(
        "Default Volume Updated",
        `The default volume for new music players has been set to **${volume}%**.\n\nThis will apply to all new music sessions started in this server.`,
        volume
      );

      const replyOptions = {
        components: [container],
        flags: MessageFlags.IsComponentsV2
      };

      const isInteraction = !!ctx.user;
      if (isInteraction) {
        await ctx.reply(replyOptions);
      } else {
        await ctx.channel.send(replyOptions);
      }
    } catch (error) {
      logger.error("SetDefaultVolume", "Error setting default volume:", error);
      return this._sendError(ctx, "Database Error", "Failed to update the default volume setting. Please try again.");
    }
  }

  async _showVolumeSettings(ctx) {
    try {
      const currentVolume = db.guild.getDefaultVolume(ctx.guild.id);
      const container = new ContainerBuilder();
      
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get("info")} **Default Volume Settings**`)
      );
      
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = `**${emoji.get("check")} Current Default Volume:** ${currentVolume}%\n\n` +
        `This volume will be used when new music players are created in this server.\n\n` +
        `**${emoji.get("folder")} Usage Examples:**\n` +
        `├─ \`setdefaultvolume 75\`\n` +
        `└─ \`/setdefaultvolume volume:75\``;

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const quickVolumeRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('volume_25')
            .setLabel('25%')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('volume_50')
            .setLabel('50%')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('volume_75')
            .setLabel('75%')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('volume_100')
            .setLabel('100%')
            .setStyle(ButtonStyle.Secondary)
        );

      container.addActionRowComponents(quickVolumeRow);

      const isInteraction = !!ctx.user;
      const reply = await (isInteraction ?
        ctx.reply({
          components: [container],
          fetchReply: true,
          flags: MessageFlags.IsComponentsV2
        }) :
        ctx.channel.send({
          components: [container],
          fetchReply: true,
          flags: MessageFlags.IsComponentsV2
        }));

      this._setupVolumeCollector(reply, isInteraction ? ctx.user.id : ctx.author.id);
    } catch (error) {
      logger.error("SetDefaultVolume", "Error showing volume settings:", error);
      return this._sendError(ctx, "Database Error", "Failed to retrieve volume settings. Please try again.");
    }
  }

  _setupVolumeCollector(message, userId) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId.startsWith('volume_')) {
        const volume = parseInt(interaction.customId.split('_')[1]);

        try {
          await interaction.deferUpdate();
          db.guild.setDefaultVolume(message.guild.id, volume);

          const newVolume = db.guild.getDefaultVolume(message.guild.id);
          const container = this._createSuccessContainer(
            "Default Volume Updated",
            `The default volume for new music players has been set to **${newVolume}%**.\n\nThis will apply to all new music sessions started in this server.`,
            newVolume
          );

          await interaction.editReply({
            components: [container]
          });
        } catch (error) {
          logger.error("SetDefaultVolume", "Error updating volume:", error);
          await interaction.followUp({
            content: `${emoji.get("cross")} Failed to update the default volume. Please try again.`,
            ephemeral: true
          });
        }
      }
    });

    collector.on('end', async () => {
      try {
        const fetchedMessage = await message.fetch().catch(() => null);
        if (fetchedMessage?.components.length > 0) {
          await fetchedMessage.edit({
            components: [this._createExpiredContainer()]
          });
        }
      } catch (error) {
        if (error.code !== 10008) {
          logger.error("SetDefaultVolume", "Failed to disable volume components:", error);
        }
      }
    });
  }

  _createSuccessContainer(title, description, volume) {
    const container = new ContainerBuilder();
    
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("check")} **${title}**`)
    );
    
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const volumeIndicator = this._getVolumeIndicator(volume);
    const fullDescription = `${description}\n\n${volumeIndicator}`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullDescription))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _getVolumeIndicator(volume) {
    const barLength = 20;
    const filledBars = Math.round((volume / 100) * barLength);
    const emptyBars = barLength - filledBars;
    const volumeBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

    let volumeLevel = "";
    if (volume <= 25) volumeLevel = `${emoji.get("folder")} Low`;
    else if (volume <= 50) volumeLevel = `${emoji.get("info")} Medium`;
    else if (volume <= 75) volumeLevel = `${emoji.get("check")} High`;
    else volumeLevel = `${emoji.get("add")} Maximum`;

    return `**${emoji.get("add")} Volume Level:** ${volumeLevel}\n\`${volumeBar}\` ${volume}%`;
  }

  _createExpiredContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("info")} **Default Volume Settings**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**This interaction has expired**\n\n` +
      `Run the command again to manage volume settings\n\n` +
      `**${emoji.get("folder")} Available Commands:**\n` +
      `├─ \`setdefaultvolume\`\n` +
      `├─ \`defaultvolume\`\n` +
      `└─ \`setdefvol\``;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  async _sendError(ctx, title, description) {
    const container = new ContainerBuilder();
    
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("cross")} **${title}**`)
    );
    
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const replyOptions = {
      components: [container],
      ephemeral: true,
      flags: MessageFlags.IsComponentsV2
    };

    const isInteraction = !!ctx.user;
    try {
      if (isInteraction) {
        if (ctx.deferred || ctx.replied) {
          await ctx.editReply(replyOptions);
        } else {
          await ctx.reply(replyOptions);
        }
      } else {
        await ctx.channel.send(replyOptions);
      }
    } catch (error) {
      logger.error("SetDefaultVolume", "Failed to send error message:", error);
    }
  }
}

export default new SetDefaultVolumeCommand();
