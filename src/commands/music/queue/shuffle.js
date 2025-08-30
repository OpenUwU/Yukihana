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

class ShuffleCommand extends Command {
  constructor() {
    super({
      name: 'shuffle',
      description: 'Shuffle the entire queue to randomize track order',
      usage: 'shuffle',
      aliases: ['shu', 'sh', 'shuf', 'mix'],
      category: 'music',
      examples: [
        'shuffle',
        'shu',
        'mix',
        'shuf',
      ],
      cooldown: 5,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'shuffle',
        description: 'Shuffle the queue',
      },
    });
  }

  async execute({ message, pm }) {
    return this._handleShuffle(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleShuffle(interaction, pm);
  }

  async _handleShuffle(context, pm) {
    if (pm.queueSize < 1) {
      return this._reply(context, this._createErrorContainer('The queue is empty.'));
    }

    await pm.shuffleQueue();

    const container = this._createSuccessContainer(pm);
    const message = await this._reply(context, container);

    if (message) {
      this._setupCollector(message, context.author || context.user);
    }
  }

  _createSuccessContainer(pm) {
    const container = new ContainerBuilder();
    const { currentTrack } = pm;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('music')} **Queue Shuffled**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Successfully randomized your music queue**\n\n` +
      `**${emoji.get('check')} Shuffle Complete**\n` +
      `├─ Randomized ${pm.queueSize} tracks in the queue\n` +
      `├─ Track order has been completely mixed\n` +
      `├─ Currently playing track remains unchanged\n` +
      `└─ Next tracks will play in shuffled order\n\n` +
      `**${emoji.get('info')} Queue Status**\n` +
      `├─ Total tracks: ${pm.queueSize}\n` +
      `├─ Queue mode: Shuffled\n` +
      `└─ Ready for playback`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('shuffle_again')
        .setLabel('Shuffle Again')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset')),
      new ButtonBuilder()
        .setCustomId('shuffle_help')
        .setLabel('Help & Info')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('info'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Shuffle Help**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**What does shuffle do?**\nRandomizes the order of all tracks in the music queue for variety.\n\n` +
      `**${emoji.get('check')} How it works:**\n` +
      `├─ Takes all queued tracks and randomizes their order\n` +
      `├─ Currently playing song continues uninterrupted\n` +
      `├─ Next tracks will play in the new shuffled order\n` +
      `└─ Can be used multiple times for different arrangements\n\n` +
      `**${emoji.get('folder')} Usage Examples:**\n` +
      `├─ \`shuffle\` → Randomize entire queue\n` +
      `├─ \`shu\` → Quick shuffle command\n` +
      `├─ \`mix\` → Alternative shuffle alias\n` +
      `└─ \`shuf\` → Short shuffle command\n\n` +
      `**${emoji.get('add')} Benefits:**\n` +
      `├─ Prevents predictable song order\n` +
      `├─ Creates variety in long playlists\n` +
      `├─ Enhances music listening experience\n` +
      `└─ Perfect for parties and social listening`;

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
        .setCustomId('shuffle_back')
        .setLabel('Back to Shuffle')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
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

  _setupCollector(message, author) {
    const filter = (i) => i.user.id === author.id;
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300_000,
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === "shuffle_again") {
          const currentPm = interaction.client.music?.getPlayer(interaction.guild.id);
          if (!currentPm || currentPm.queueSize < 1) {
            await interaction.editReply({
              components: [this._createErrorContainer('Queue is empty or player unavailable.')],
            });
            return;
          }

          await currentPm.shuffleQueue();
          const updatedContainer = this._createSuccessContainer(currentPm);
          await interaction.editReply({ components: [updatedContainer] });
        } else if (interaction.customId === "shuffle_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "shuffle_back") {
          const currentPm = interaction.client.music?.getPlayer(interaction.guild.id);
          if (currentPm) {
            const container = this._createSuccessContainer(currentPm);
            await interaction.editReply({ components: [container] });
          }
        }
      } catch (error) {
        logger.error("ShuffleCommand", "Collector Error:", error);
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
      logger.debug("ShuffleCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("ShuffleCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("ShuffleCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
    }
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
      logger.error("ShuffleCommand", "Failed to reply in Shuffle command:", e);
      return null;
    }
  }
}

export default new ShuffleCommand();