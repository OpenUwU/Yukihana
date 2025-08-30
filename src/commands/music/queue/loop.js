import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#structures/classes/Command';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';

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
    const mode = args?.[0]?.toLowerCase();
    if (mode && ["off", "track", "queue"].includes(mode)) {
      return this._handleDirectLoop(message, pm, mode);
    }
    return this._handleLoop(message, pm, client);
  }

  async slashExecute({ interaction, pm, client }) {
    const mode = interaction.options.getString("mode");
    if (mode) {
      return this._handleDirectLoop(interaction, pm, mode);
    }
    return this._handleLoop(interaction, pm, client);
  }

  async _handleDirectLoop(context, pm, mode) {
    await pm.setRepeatMode(mode);

    let modeText = "";
    switch (mode) {
      case "off":
        modeText = "Loop is OFF";
        break;
      case "track":
        modeText = "Looping Current Track";
        break;
      case "queue":
        modeText = "Looping Queue";
        break;
    }

    const container = this._createDirectModeContainer(pm, mode, modeText);
    const sent = await this._reply(context, container);

    if (sent) {
      this._setupCollector(sent, context.author || context.user, pm);
    }
  }

  async _handleLoop(context, pm, client) {
    const container = this._buildLoopContainer(pm);
    const message = await this._reply(context, container);

    if (message) {
      this._setupCollector(message, context.author || context.user, pm);
    }
  }

  _createDirectModeContainer(pm, mode, modeText) {
    const container = new ContainerBuilder();
    const currentTrack = pm.currentTrack;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('check')} **${modeText}**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let content = `**Loop mode has been updated**\n\n`;

    switch (mode) {
      case "off":
        content += `**${emoji.get('cross')} Loop Disabled**\n` +
          `├─ Music will play normally\n` +
          `├─ Songs play once and continue to next\n` +
          `├─ Queue will end when all tracks finish\n` +
          `└─ No repetition of tracks or queue\n\n`;
        break;
      case "track":
        content += `**${emoji.get('music')} Track Loop Enabled**\n` +
          `├─ Current song will repeat indefinitely\n` +
          `├─ Same track plays over and over\n` +
          `├─ Queue progression is paused\n` +
          `└─ Perfect for favorite songs\n\n`;
        break;
      case "queue":
        content += `**${emoji.get('folder')} Queue Loop Enabled**\n` +
          `├─ Entire queue will repeat when finished\n` +
          `├─ All tracks play in order, then restart\n` +
          `├─ Continuous playback of full playlist\n` +
          `└─ Great for long listening sessions\n\n`;
        break;
    }

    content += `**${emoji.get('info')} Current Status**\n` +
      `├─ Loop mode: ${modeText}\n` +
      `├─ Queue length: ${pm.queueSize} tracks\n` +
      `└─ Click buttons below to change mode`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addActionRowComponents(this._createLoopButtons(pm));
    return container;
  }

  _buildLoopContainer(pm) {
    const container = new ContainerBuilder();
    const currentTrack = pm.currentTrack;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('music')} **Loop Control**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let currentModeText = "";
    let statusContent = "";

    switch (pm.repeatMode) {
      case "off":
        currentModeText = `**${emoji.get('cross')} Loop is OFF**`;
        statusContent = `**Current loop settings and controls**\n\n` +
          `**${emoji.get('info')} Current Mode: Disabled**\n` +
          `├─ Music plays normally without repetition\n` +
          `├─ Songs play once then move to next track\n` +
          `├─ Queue ends when all tracks are finished\n` +
          `└─ Select a loop mode below to enable repetition\n\n`;
        break;
      case "track":
        currentModeText = `**${emoji.get('music')} Looping Current Track**`;
        statusContent = `**Current loop settings and controls**\n\n` +
          `**${emoji.get('info')} Current Mode: Track Loop**\n` +
          `├─ Same song repeats indefinitely\n` +
          `├─ Queue progression is paused\n` +
          `├─ Perfect for enjoying favorite tracks\n` +
          `└─ Change mode below or disable looping\n\n`;
        break;
      case "queue":
        currentModeText = `**${emoji.get('folder')} Looping Queue**`;
        statusContent = `**Current loop settings and controls**\n\n` +
          `**${emoji.get('info')} Current Mode: Queue Loop**\n` +
          `├─ Entire playlist repeats when finished\n` +
          `├─ All ${pm.queueSize} tracks play in order\n` +
          `├─ Continuous playback for long sessions\n` +
          `└─ Change mode below or disable looping\n\n`;
        break;
    }

    statusContent += `**${emoji.get('add')} Available Modes**\n` +
      `├─ **Off**: Normal playback, no repetition\n` +
      `├─ **Track**: Repeat current song indefinitely\n` +
      `└─ **Queue**: Repeat entire playlist continuously`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(currentModeText),
        new TextDisplayBuilder().setContent(statusContent)
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addActionRowComponents(this._createLoopButtons(pm));

    const helpButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('loop_help')
        .setLabel('Help & Info')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('info'))
    );

    container.addActionRowComponents(helpButtons);
    return container;
  }

  _createLoopButtons(pm) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`loop_off_${pm.guildId}`)
        .setLabel("Off")
        .setStyle(pm.repeatMode === "off" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(pm.repeatMode === "off"),
      new ButtonBuilder()
        .setCustomId(`loop_track_${pm.guildId}`)
        .setLabel("Track")
        .setStyle(pm.repeatMode === "track" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(pm.repeatMode === "track"),
      new ButtonBuilder()
        .setCustomId(`loop_queue_${pm.guildId}`)
        .setLabel("Queue")
        .setStyle(pm.repeatMode === "queue" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(pm.repeatMode === "queue")
    );
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Loop Help**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Control music repetition and playback modes**\n\n` +
      `**${emoji.get('cross')} Off Mode**\n` +
      `├─ Normal playback without any repetition\n` +
      `├─ Each song plays once then moves to next\n` +
      `├─ Queue ends when all tracks finish\n` +
      `└─ Default mode for most listening\n\n` +
      `**${emoji.get('music')} Track Loop**\n` +
      `├─ Current song repeats indefinitely\n` +
      `├─ Same track plays over and over\n` +
      `├─ Queue progression stops until disabled\n` +
      `└─ Perfect for favorite or study songs\n\n` +
      `**${emoji.get('folder')} Queue Loop**\n` +
      `├─ Entire playlist repeats when finished\n` +
      `├─ All tracks play in order, then restart\n` +
      `├─ Continuous playback for hours\n` +
      `└─ Great for parties and background music\n\n` +
      `**${emoji.get('add')} Usage Examples**\n` +
      `├─ \`loop\` → Interactive loop control panel\n` +
      `├─ \`loop off\` → Disable all looping\n` +
      `├─ \`loop track\` → Repeat current song\n` +
      `└─ \`repeat queue\` → Loop entire playlist`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('loop_back')
        .setLabel('Back to Controls')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  async _setupCollector(message, author, pm) {
    const filter = (i) => i.user.id === author.id;
    const collector = message.createMessageComponentCollector({ filter, time: 300_000 });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();
        const currentPlayer = interaction.client.music?.getPlayer(interaction.guild.id);

        if (!currentPlayer) {
          collector.stop();
          return;
        }

        if (interaction.customId.startsWith('loop_') && interaction.customId !== 'loop_help' && interaction.customId !== 'loop_back') {
          const action = interaction.customId.split('_')[1];
          await currentPlayer.setRepeatMode(action);

          const newContainer = this._buildLoopContainer(currentPlayer);
          await interaction.editReply({ components: [newContainer] });
        } else if (interaction.customId === 'loop_help') {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === 'loop_back') {
          const currentPlayer = interaction.client.music?.getPlayer(interaction.guild.id);
          if (currentPlayer) {
            const container = this._buildLoopContainer(currentPlayer);
            await interaction.editReply({ components: [container] });
          }
        }
      } catch (error) {
        logger.error("LoopCommand", "Collector Error:", error);
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "limit" || reason === "messageDelete") return;

      try {
        const currentMessage = await this._fetchMessage(message).catch(() => null);

        if (!currentMessage?.components?.length) {
          return;
        }

        const containerWithoutButtons = new ContainerBuilder();

        currentMessage.components.forEach(component => {
          if (component.type !== ComponentType.ActionRow) {
            if (component.type === ComponentType.TextDisplay) {
              containerWithoutButtons.addTextDisplayComponents(component);
            } else if (component.type === ComponentType.Separator) {
              containerWithoutButtons.addSeparatorComponents(component);
            } else if (component.type === ComponentType.Section) {
              containerWithoutButtons.addSectionComponents(component);
            }
          }
        });

        await currentMessage.edit({
          components: [containerWithoutButtons],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (error) {
        this._handleDisableError(error, reason);
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

  _handleDisableError(error, reason) {
    if (error.code === 10008) {
      logger.debug("LoopCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("LoopCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("LoopCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
    }
  }

  _createErrorContainer(message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('cross')} **Error**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  async _reply(context, container) {
    const payload = {
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