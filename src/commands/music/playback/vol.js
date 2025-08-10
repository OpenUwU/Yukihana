import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";

class VolumeCommand extends Command {
  constructor() {
    super({
      name: "volume",
      description: "Adjust or view the music playback volume with an interactive control panel",
      usage: "volume [level]",
      aliases: ["v", "vol"],
      category: "music",
      examples: [
        "volume",
        "volume 50",
        "vol 100",
        "v 75"
      ],
      cooldown: 2,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: "volume",
        description: "View or set the player volume",
        options: [{
          name: "level",
          description: "A number between 0 and 150",
          type: 4,
          required: false,
          min_value: 0,
          max_value: 150
        }]
      },
    });
  }

  async execute({ client, message, args, pm }) {
    const level   =args[0] ? parseInt(args[0], 10) : undefined;
    return this._handleVolume(client, message, pm, level);
  }

  async slashExecute({ client, interaction, pm }) {
    const level   =interaction.options.getInteger("level");
    return this._handleVolume(client, interaction, pm, level);
  }

  async _handleVolume(client, context, pm, level) {
    if (typeof level   ==='number') {
      if (isNaN(level) || level < 0 || level > 150) {
        return this._reply(context, this._createErrorContainer("Volume must be between 0 and 150."));
      }
      await pm.setVolume(level);
    }

    const message   =await this._reply(context, this._buildVolumeContainer(pm));
    if (message) {
        this._setupCollector(message, client, pm.guildId);
    }
  }

  _buildVolumeContainer(pm) {
    const container   =new ContainerBuilder();
    const volume   =pm.volume;
    const barLength   =15;
    const filledBlocks   =Math.round((volume / 150) * barLength);
    const emptyBlocks   =barLength - filledBlocks;
    const volumeBar   ='█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    const artworkUrl   =pm.currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Volume Control")
    );

    container.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Current Volume: ${volume}%**\n\`${volumeBar}\``)
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(artworkUrl))
    );

    container.addActionRowComponents(this._createButtons(pm));
    return container;
  }

  _createButtons(pm) {
    const volume   =pm.volume;
    const isMuted   =volume   ===0;

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
        .setDisabled(volume >= 150)
    );
  }

  async _setupCollector(message, client, guildId) {
    const filter   =(i)   => i.customId.startsWith('vol_') && i.customId.endsWith(guildId);
    const collector   =message.createMessageComponentCollector({ filter, time: 120_000 });

    collector.on("collect", async (interaction)   => {
      await interaction.deferUpdate();
      const player   =client.music?.getPlayer(guildId);
      if (!player) {
        collector.stop();
        return;
      }

      const pm   =new PlayerManager(player);
      const action   =interaction.customId.split('_')[1];

      switch (action) {
        case 'minus':
          await pm.setVolume(Math.max(0, pm.volume - 10));
          break;
        case 'plus':
          await pm.setVolume(Math.min(150, pm.volume + 10));
          break;
        case 'mute':
          if (pm.volume > 0) {
            pm.setData("oldVolume", pm.volume);
            await pm.setVolume(0);
          } else {
            const oldVolume   =pm.getData("oldVolume") || 100;
            await pm.setVolume(oldVolume);
          }
          break;
      }

      const newContainer   =this._buildVolumeContainer(pm);
      await interaction.editReply({ components: [newContainer] });
    });

    collector.on("end", async ()   => {
      try {
        const currentMessage   =await message.fetch().catch(()   => null);
        if (!currentMessage || currentMessage.components.length   ===0) return;

        const disabledRow   =new ActionRowBuilder();
        currentMessage.components[0].components.forEach(component   => {
            if (component.type   ===2) {
                const button   =ButtonBuilder.from(component).setDisabled(true);
                disabledRow.addComponents(button);
            }
        });

        if (disabledRow.components.length > 0) {
            await currentMessage.edit({ components: [disabledRow] });
        }
      } catch (e) {
        if (e.code   !==10008) logger.error("VolumeCommand", "Failed to disable volume components:", e);
      }
    });
  }

  _createErrorContainer(message) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Error**\n*${message}*`)
    );
  }

  async _reply(context, container) {
    const payload   ={
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    };
    try {
      if (context.replied || context.deferred) {
        return context.followUp(payload);
      }
      return context.reply(payload);
    } catch(e) {
      logger.error("VolumeCommand", "Failed to reply in Volume command:", e);
      return null;
    }
  }
}

export default new VolumeCommand();
