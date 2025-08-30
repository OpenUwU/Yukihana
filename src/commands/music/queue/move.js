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

class MoveCommand extends Command {
  constructor() {
    super({
      name: 'move',
      description: 'Move a track to a different position in the queue',
      usage: 'move <from> <to>',
      aliases: ['mv'],
      category: 'music',
      examples: [
        'move 3 1',
        'move 5 2',
        'mv 1 10',
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'move',
        description: 'Move a track to a different position in the queue',
        options: [
          {
            name: 'from',
            description: 'Current position of the track (1-based)',
            type: 4,
            required: true,
            min_value: 1,
          },
          {
            name: 'to',
            description: 'New position for the track (1-based)',
            type: 4,
            required: true,
            min_value: 1,
          },
        ],
      },
    });
  }

  async execute({ client, message, args, pm }) {
    try {
      const { player } = pm;

      if (!player || !player.queue.current) {
        return this._sendError(message, 'No music is currently playing');
      }

      if (args.length < 2) {
        return this._sendUsageError(message);
      }

      const fromPos = parseInt(args[0]);
      const toPos = parseInt(args[1]);

      if (isNaN(fromPos) || isNaN(toPos)) {
        return this._sendError(message, 'Both positions must be valid numbers');
      }

      const queue = player.queue.tracks;

      if (queue.length === 0) {
        return this._sendError(message, 'There are no tracks in the queue to move');
      }

      if (fromPos < 1 || fromPos > queue.length || toPos < 1 || toPos > queue.length) {
        return this._sendError(message, `Positions must be between 1 and ${queue.length}`);
      }

      if (fromPos === toPos) {
        return this._sendError(message, 'The track is already at that position');
      }

      const track = queue[fromPos - 1];
      queue.splice(fromPos - 1, 1);
      queue.splice(toPos - 1, 0, track);

      const container = this._createSuccessContainer(track, fromPos, toPos, queue.length);
      const sent = await this._reply(message, container);

      if (sent) {
        this._setupCollector(sent, message.author);
      }
    } catch (error) {
      logger.error('MoveCommand', 'Move command error:', error);
      return this._sendError(message, 'An error occurred while moving the track');
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const player = client.music?.getPlayer(interaction.guild.id);

      if (!player || !player.queue.current) {
        return this._sendError(interaction, 'No music is currently playing');
      }

      const fromPos = interaction.options.getInteger('from');
      const toPos = interaction.options.getInteger('to');
      const queue = player.queue.tracks;

      if (queue.length === 0) {
        return this._sendError(interaction, 'There are no tracks in the queue to move');
      }

      if (fromPos < 1 || fromPos > queue.length || toPos < 1 || toPos > queue.length) {
        return this._sendError(interaction, `Positions must be between 1 and ${queue.length}`);
      }

      if (fromPos === toPos) {
        return this._sendError(interaction, 'The track is already at that position');
      }

      const track = queue[fromPos - 1];
      queue.splice(fromPos - 1, 1);
      queue.splice(toPos - 1, 0, track);

      const container = this._createSuccessContainer(track, fromPos, toPos, queue.length);
      const sent = await this._reply(interaction, container);

      if (sent) {
        this._setupCollector(sent, interaction.user);
      }
    } catch (error) {
      logger.error('MoveCommand', 'Move slash command error:', error);
      return this._sendError(interaction, 'An error occurred while moving the track');
    }
  }

  _createSuccessContainer(track, fromPos, toPos, queueLength) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('check')} **Track Moved**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const direction = fromPos < toPos ? 'down' : 'up';
    const content = `**Successfully repositioned track in queue**\n\n` +
      `**${emoji.get('music')} Moved Track**\n` +
      `├─ **[${track.info.title}](${track.info.uri || '#'})**\n` +
      `├─ Artist: ${track.info.author || 'Unknown'}\n` +
      `├─ From position: ${fromPos}\n` +
      `├─ To position: ${toPos}\n` +
      `└─ Duration: ${this._formatDuration(track.info.length)}\n\n` +
      `**${emoji.get('folder')} Queue Status**\n` +
      `├─ Total tracks: ${queueLength}\n` +
      `├─ Track moved ${direction} in queue\n` +
      `├─ Other tracks automatically repositioned\n` +
      `└─ Queue order updated successfully`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('move_help')
        .setLabel('Help & Info')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('info'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createUsageContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Move Usage**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**How to use the move command**\n\n` +
      `**${emoji.get('check')} Command Format**\n` +
      `├─ \`${this.usage}\`\n` +
      `├─ Both positions are required\n` +
      `├─ Position numbers start from 1\n` +
      `└─ Track will be moved to new position\n\n` +
      `**${emoji.get('folder')} Usage Examples**\n` +
      `├─ \`move 3 1\` → Move track from position 3 to position 1\n` +
      `├─ \`move 1 5\` → Move first track to position 5\n` +
      `├─ \`mv 10 2\` → Move track from position 10 to position 2\n` +
      `└─ Both positions must exist in current queue\n\n` +
      `**${emoji.get('add')} Requirements**\n` +
      `├─ Must be in the same voice channel\n` +
      `├─ Queue must contain tracks\n` +
      `├─ Both positions must be valid (1 to queue length)\n` +
      `└─ Music player must be active`;

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
        .setCustomId('move_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Move Help**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Reorder tracks in your music queue**\n\n` +
      `**${emoji.get('check')} What it does:**\n` +
      `├─ Moves a track from one position to another\n` +
      `├─ Other tracks automatically adjust positions\n` +
      `├─ Queue order is preserved around the moved track\n` +
      `└─ Currently playing song is unaffected\n\n` +
      `**${emoji.get('folder')} Command Examples:**\n` +
      `├─ \`move 5 1\` → Move track 5 to the front\n` +
      `├─ \`mv 1 10\` → Move first track to position 10\n` +
      `├─ \`move 3 7\` → Move track from 3rd to 7th position\n` +
      `└─ Use \`queue\` command to see current positions\n\n` +
      `**${emoji.get('add')} Tips:**\n` +
      `├─ Check queue first to find track positions\n` +
      `├─ Moving up: other tracks shift down\n` +
      `├─ Moving down: other tracks shift up\n` +
      `└─ Use \`bump\` to quickly move tracks to top`;

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
        .setCustomId('move_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
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

        if (interaction.customId === "move_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "move_back") {
          await interaction.editReply({
            components: [this._createUsageContainer()],
          });
        }
      } catch (error) {
        logger.error("MoveCommand", "Collector Error:", error);
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
      logger.debug("MoveCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("MoveCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("MoveCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
    }
  }

  _sendUsageError(context) {
    const container = this._createUsageContainer();
    const sent = this._reply(context, container);

    if (sent) {
      this._setupCollector(sent, context.author || context.user);
    }
    return sent;
  }

  _sendError(context, message) {
    const container = this._createErrorContainer(message);
    return this._reply(context, container);
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

  _formatDuration(ms) {
    if (!ms || ms === 0) return '0:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
      logger.error("MoveCommand", "Failed to reply in Move command:", e);
      return null;
    }
  }
}

export default new MoveCommand();