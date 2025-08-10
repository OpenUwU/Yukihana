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

import { config } from "#config/config";
import { logger } from "#utils/logger";

class LoopCommand extends Command {
  constructor() {
    super({
      name: "loop",
      description: "Toggle the loop mode between off, track, and queue with interactive controls",
      usage: "loop [off|track|queue]",
      aliases: ["repeat"],
      category: "music",
      examples: [
        "loop",
        "loop off",
        "loop track",
        "loop queue",
        "repeat"
      ],
      cooldown: 5,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: "loop",
        description: "Toggle the loop mode",
        options: [
          {
            name: "mode",
            description: "Loop mode to set",
            type: 3,
            required: false,
            choices: [
              { name: "Off", value: "off" },
              { name: "Track", value: "track" },
              { name: "Queue", value: "queue" }
            ]
          }
        ]
      },
    });
  }

  async execute({ message, args, pm, client }) {
    const mode   =args?.[0]?.toLowerCase();
    if (mode && ["off", "track", "queue"].includes(mode)) {
      return this._handleDirectLoop(message, pm, mode);
    }
    return this._handleLoop(message, pm, client);
  }

  async slashExecute({ interaction, pm, client }) {
    const mode   =interaction.options.getString("mode");
    if (mode) {
      return this._handleDirectLoop(interaction, pm, mode);
    }
    return this._handleLoop(interaction, pm, client);
  }

  async _handleDirectLoop(context, pm, mode) {
    await pm.setRepeatMode(mode);

    let modeText   ="";
    switch (mode) {
      case "off":
        modeText   ="Loop is OFF";
        break;
      case "track":
        modeText   ="Looping Current Track";
        break;
      case "queue":
        modeText   ="Looping Queue";
        break;
    }

    const container   =new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${modeText}**`)
    );

    return this._reply(context, container);
  }

  async _handleLoop(context, pm, client) {
    const container   =this._buildLoopContainer(pm);
    const message   =await this._reply(context, container);

    if (message) {
      this._setupCollector(message, client, pm.guildId, pm);
    }
  }

  _buildLoopContainer(pm) {
    const container   =new ContainerBuilder();
    const currentTrack   =pm.currentTrack;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Loop Control")
    );

    let currentModeText   ="";
    switch (pm.repeatMode) {
      case "off":
        currentModeText   ="**Loop is OFF**";
        break;
      case "track":
        currentModeText   ="**Looping Current Track**";
        break;
      case "queue":
        currentModeText   ="**Looping Queue**";
        break;
    }

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(currentModeText),
          new TextDisplayBuilder().setContent("*Select a loop mode below:*")
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork
          )
        )
    );

    container.addActionRowComponents(this._createLoopButtons(pm));
    return container;
  }

  _createLoopButtons(pm) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`loop_off_${pm.guildId}`)
        .setLabel("Off")
        .setStyle(
          pm.repeatMode   ==="off" ? ButtonStyle.Primary : ButtonStyle.Secondary
        )
        .setDisabled(pm.repeatMode   ==="off"),
      new ButtonBuilder()
        .setCustomId(`loop_track_${pm.guildId}`)
        .setLabel("Track")
        .setStyle(
          pm.repeatMode   ==="track" ? ButtonStyle.Primary : ButtonStyle.Secondary
        )
        .setDisabled(pm.repeatMode   ==="track"),
      new ButtonBuilder()
        .setCustomId(`loop_queue_${pm.guildId}`)
        .setLabel("Queue")
        .setStyle(
          pm.repeatMode   ==="queue" ? ButtonStyle.Primary : ButtonStyle.Secondary
        )
        .setDisabled(pm.repeatMode   ==="queue")
    );
  }

  async _setupCollector(message, client, guildId, pm) {
    const filter   =(i)   => i.customId.startsWith('loop_') && i.customId.endsWith(guildId);
    const collector   =message.createMessageComponentCollector({ filter, time: 60_000 });

    collector.on("collect", async (interaction)   => {
      await interaction.deferUpdate();
      const currentPlayer   =client.music?.getPlayer(guildId);
      if (!currentPlayer) {
        collector.stop();
        return;
      }

      const currentPm   =pm
      const action   =interaction.customId.split('_')[1];

      await currentPm.setRepeatMode(action);

      const newContainer   =this._buildLoopContainer(currentPm);
      await interaction.editReply({ components: [newContainer] });
    });

    collector.on("end", async ()   => {
      try {
        const currentMessage   =await message.fetch().catch(()   => null);
        if (!currentMessage || currentMessage.components.length   ===0) return;

        const disabledRow   =new ActionRowBuilder();
        currentMessage.components[0].components.forEach(component   => {
          if(component.type   ===2) {
            const button   =ButtonBuilder.from(component).setDisabled(true);
            disabledRow.addComponents(button);
          }
        });

        if (disabledRow.components.length > 0) {
            await currentMessage.edit({ components: [disabledRow] });
        }
      } catch (e) {
        if (e.code   !==10008) logger.error("LoopCommand", "Failed to disable loop components:", e);
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
      logger.error("LoopCommand", "Failed to reply in Loop command:", e);
      return null;
    }
  }
}

export default new LoopCommand();
