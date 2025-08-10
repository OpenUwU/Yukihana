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
      userPermissions: [PermissionFlagsBits.Administrator],
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
    const volume   =args[0] ? parseInt(args[0]) : null;
    await this._handleCommand(message, volume);
  }

  async slashExecute({ interaction }) {
    const volume   =interaction.options.getInteger("volume");
    await this._handleCommand(interaction, volume);
  }

  async _handleCommand(ctx, volume) {
    const isInteraction   =!!ctx.user;
    const guild   =ctx.guild;
    const user   =isInteraction ? ctx.user : ctx.author;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator) && !config.ownerIds.includes(user.id)) {
      return this._sendError(ctx, "Permission Denied", "Only server administrators can change the default volume setting.");
    }

    if (volume   !==null) {
      if (isNaN(volume) || volume < 1 || volume > 100) {
        return this._sendError(ctx, "Invalid Volume", "Volume must be a number between 1 and 100.");
      }

      await this._setDefaultVolume(ctx, volume, isInteraction);
    } else {
      await this._showVolumeSettings(ctx, isInteraction);
    }
  }

  async _setDefaultVolume(ctx, volume, isInteraction) {
    try {
      db.guild.setDefaultVolume(ctx.guild.id, volume);

      const container   =this._createSuccessContainer(
        "Default Volume Updated",
        `The default volume for new music players has been set to **${volume}%**.\n\nThis will apply to all new music sessions started in this server.`,
        volume
      );

      const replyOptions   ={
        components: [container],
        flags: MessageFlags.IsComponentsV2
      };

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

  async _showVolumeSettings(ctx, isInteraction) {
    try {
      const currentVolume   =db.guild.getDefaultVolume(ctx.guild.id);

      const container   =new ContainerBuilder();
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Default Volume Settings`)
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const section   =new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Current Default Volume:** ${currentVolume}%`),
          new TextDisplayBuilder().setContent(`\nThis volume will be used when new music players are created in this server.\n\nTo change it, use the command with a new volume level.\nExample: \`setdefaultvolume 75\` or \`/setdefaultvolume volume:75\``)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

      container.addSectionComponents(section);

      const quickVolumeRow   =new ActionRowBuilder()
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

      const reply   =await (isInteraction ?
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
    const collector   =message.createMessageComponentCollector({
      filter: (i)   => i.user.id   ===userId,
      time: 300_000,
    });

    collector.on('collect', async (interaction)   => {
      if (interaction.customId.startsWith('volume_')) {
        const volume   =parseInt(interaction.customId.split('_')[1]);

        try {
          await interaction.deferUpdate();

          db.guild.setDefaultVolume(message.guild.id, volume);

          const newVolume   =db.guild.getDefaultVolume(message.guild.id);
          const container   =this._createSuccessContainer(
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
            content: "❌ Failed to update the default volume. Please try again.",
            ephemeral: true
          });
        }
      }
    });

    collector.on('end', async ()   => {
      try {
        const fetchedMessage   =await message.fetch().catch(()   => null);
        if (fetchedMessage && fetchedMessage.components.length > 0) {
          const disabledComponents   =fetchedMessage.components.map(row   => {
            const newRow   =new ActionRowBuilder();
            row.components.forEach(comp   => {
              if (comp.type   ===2) {
                const newComp   =ButtonBuilder.from(comp).setDisabled(true);
                newRow.addComponents(newComp);
              }
            });
            return newRow;
          });
          await fetchedMessage.edit({
            components: disabledComponents
          });
        }
      } catch (error) {
        if (error.code   !==10008) {
          logger.error("SetDefaultVolume", "Failed to disable volume components:", error);
        }
      }
    });
  }

  _createSuccessContainer(title, description, volume) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${title}`)
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const volumeIndicator   =this._getVolumeIndicator(volume);
    const fullDescription   =`${description}\n\n${volumeIndicator}`;

    const section   =new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullDescription))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);
    return container;
  }

  _getVolumeIndicator(volume) {
    const barLength   =20;
    const filledBars   =Math.round((volume / 100) * barLength);
    const emptyBars   =barLength - filledBars;

    const volumeBar   ='█'.repeat(filledBars) + '░'.repeat(emptyBars);

    let volumeLevel   ="";
    if (volume <= 25) volumeLevel   ="🔈 Low";
    else if (volume <= 50) volumeLevel   ="🔉 Medium";
    else if (volume <= 75) volumeLevel   ="🔊 High";
    else volumeLevel   ="📢 Maximum";

    return `**Volume Level:** ${volumeLevel}\n\`${volumeBar}\` ${volume}%`;
  }

  async _sendError(ctx, title, description) {
    const isInteraction   =!!ctx.user;
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const section   =new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    const replyOptions   ={
      components: [container],
      ephemeral: true,
      flags: MessageFlags.IsComponentsV2
    };

    if (isInteraction) {
      if (ctx.deferred || ctx.replied) {
        await ctx.editReply(replyOptions);
      } else {
        await ctx.reply(replyOptions);
      }
    } else {
      await ctx.channel.send(replyOptions);
    }
  }
}

export default new SetDefaultVolumeCommand();
