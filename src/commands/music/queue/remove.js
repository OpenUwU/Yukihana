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

class RemoveCommand extends Command {
  constructor() {
    super({
      name: 'remove',
      description: 'Remove a track from the queue',
      usage: 'remove <position>',
      aliases: ['rm', 'del'],
      category: 'music',
      examples: [
        'remove 3',
        'rm 1',
        'del 5',
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'remove',
        description: 'Remove a track from the queue',
        options: [
          {
            name: 'position',
            description: 'Position of the track to remove (1-based)',
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

      if (args.length   ===0) {
        return this.sendUsageError(message);
      }

      const position   =parseInt(args[0]);

      if (isNaN(position)) {
        return this.sendError(message, 'Invalid Position', 'Position must be a valid number');
      }

      const queue   =player.queue.tracks;

      if (queue.length   ===0) {
        return this.sendError(message, 'Empty Queue', 'There are no tracks in the queue to remove');
      }

      if (position < 1 || position > queue.length) {
        return this.sendError(message, 'Invalid Position', `Position must be between 1 and ${queue.length}`);
      }

      const track   =queue[position - 1];

      queue.splice(position - 1, 1);

      const container   =new ContainerBuilder();
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Track Removed'));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Successfully Removed**'),
            new TextDisplayBuilder().setContent(`*${track.info.title}*\nRemoved from position ${position}`),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)),
      );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      logger.error('RemoveCommand', 'Remove command error:', error);
      return this.sendError(message, 'Command Error', 'An error occurred while removing the track');
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const player   =client.music?.getPlayer(interaction.guild.id);

      if (!player || !player.queue.current) {
        return this.sendError(interaction, 'No Player', 'No music is currently playing');
      }

      const position   =interaction.options.getInteger('position');

      const queue   =player.queue.tracks;

      if (queue.length   ===0) {
        return this.sendError(interaction, 'Empty Queue', 'There are no tracks in the queue to remove');
      }

      if (position < 1 || position > queue.length) {
        return this.sendError(interaction, 'Invalid Position', `Position must be between 1 and ${queue.length}`);
      }

      const track   =queue[position - 1];

      queue.splice(position - 1, 1);

      const container   =new ContainerBuilder();
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Track Removed'));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Successfully Removed**'),
            new TextDisplayBuilder().setContent(`*${track.info.title}*\nRemoved from position ${position}`),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)),
      );

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      logger.error('RemoveCommand', 'Remove slash command error:', error);
      return this.sendError(interaction, 'Command Error', 'An error occurred while removing the track');
    }
  }

  sendUsageError(messageOrInteraction) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Invalid Usage'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Command Usage**'),
          new TextDisplayBuilder().setContent(`*${this.usage}*\n\nExample: \`remove 3\` removes the track at position 3`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork)),
    );

    const payload   ={ components: [container], flags: MessageFlags.IsComponentsV2 };

    if (messageOrInteraction.deferred || messageOrInteraction.replied) {
      return messageOrInteraction.editReply(payload);
    } else if (messageOrInteraction.reply) {
      return messageOrInteraction.reply(payload);
    }
    return messageOrInteraction.followUp(payload);
  }

  sendError(messageOrInteraction, title, description) {
    const container   =new ContainerBuilder();
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

    const payload   ={ components: [container], flags: MessageFlags.IsComponentsV2 };

    if (messageOrInteraction.deferred || messageOrInteraction.replied) {
      return messageOrInteraction.editReply(payload);
    } else if (messageOrInteraction.reply) {
      return messageOrInteraction.reply(payload);
    }
    return messageOrInteraction.followUp(payload);
  }
}

export default new RemoveCommand();
