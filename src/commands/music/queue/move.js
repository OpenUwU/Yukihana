import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#structures/classes/Command';
import { logger } from '#utils/logger';

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
        return this.sendError(message, 'No Player', 'No music is currently playing');
      }

      if (args.length < 2) {
        return this.sendUsageError(message);
      }

      const fromPos = parseInt(args[0]);
      const toPos = parseInt(args[1]);

      if (isNaN(fromPos) || isNaN(toPos)) {
        return this.sendError(message, 'Invalid Position', 'Both positions must be valid numbers');
      }

      const queue = player.queue.tracks;

      if (queue.length === 0) {
        return this.sendError(message, 'Empty Queue', 'There are no tracks in the queue to move');
      }

      if (fromPos < 1 || fromPos > queue.length || toPos < 1 || toPos > queue.length) {
        return this.sendError(message, 'Invalid Position', `Positions must be between 1 and ${queue.length}`);
      }

      if (fromPos === toPos) {
        return this.sendError(message, 'Same Position', 'The track is already at that position');
      }

      const track = queue[fromPos - 1];

      queue.splice(fromPos - 1, 1);

      queue.splice(toPos - 1, 0, track);

      const container = new ContainerBuilder();
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Track Moved'));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Successfully Moved**'),
            new TextDisplayBuilder().setContent(`*${track.info.title}*\nFrom position ${fromPos} to position ${toPos}`),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)),
      );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      logger.error('MoveCommand', 'Move command error:', error);
      return this.sendError(message, 'Command Error', 'An error occurred while moving the track');
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const player = client.music?.getPlayer(interaction.guild.id);

      if (!player || !player.queue.current) {
        return this.sendError(interaction, 'No Player', 'No music is currently playing');
      }

      const fromPos = interaction.options.getInteger('from');
      const toPos = interaction.options.getInteger('to');

      const queue = player.queue.tracks;

      if (queue.length === 0) {
        return this.sendError(interaction, 'Empty Queue', 'There are no tracks in the queue to move');
      }

      if (fromPos < 1 || fromPos > queue.length || toPos < 1 || toPos > queue.length) {
        return this.sendError(interaction, 'Invalid Position', `Positions must be between 1 and ${queue.length}`);
      }

      if (fromPos === toPos) {
        return this.sendError(interaction, 'Same Position', 'The track is already at that position');
      }

      const track = queue[fromPos - 1];

      queue.splice(fromPos - 1, 1);

      queue.splice(toPos - 1, 0, track);

      const container = new ContainerBuilder();
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Track Moved'));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Successfully Moved**'),
            new TextDisplayBuilder().setContent(`*${track.info.title}*\nFrom position ${fromPos} to position ${toPos}`),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)),
      );

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      logger.error('MoveCommand', 'Move slash command error:', error);
      return this.sendError(interaction, 'Command Error', 'An error occurred while moving the track');
    }
  }

  sendUsageError(messageOrInteraction) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Invalid Usage'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Command Usage**'),
          new TextDisplayBuilder().setContent(`*${this.usage}*\n\nExample: \`move 3 1\` moves track from position 3 to position 1`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)),
    );

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };

    if (messageOrInteraction.deferred || messageOrInteraction.replied) {
      return messageOrInteraction.editReply(payload);
    } else if (messageOrInteraction.reply) {
      return messageOrInteraction.reply(payload);
    }
    return messageOrInteraction.followUp(payload);
  }

  sendError(messageOrInteraction, title, description) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Error**'),
          new TextDisplayBuilder().setContent(`*${description}*`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)),
    );

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };

    if (messageOrInteraction.deferred || messageOrInteraction.replied) {
      return messageOrInteraction.editReply(payload);
    } else if (messageOrInteraction.reply) {
      return messageOrInteraction.reply(payload);
    }
    return messageOrInteraction.followUp(payload);
  }
}

export default new MoveCommand();
