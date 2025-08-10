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

class ForwardCommand extends Command {
  constructor() {
    super({
      name: 'forward',
      description: 'Forward the current track by specified seconds (default: 10 seconds, not available for live streams)',
      usage: 'forward [seconds]',
      aliases: ['fw'],
      category: 'music',
      examples: [
        'forward',
        'forward 30',
        'fw 15',
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'forward',
        description: 'Forward the current track by specified seconds',
        options: [
          {
            name: 'seconds',
            description: 'Number of seconds to forward (default: 10)',
            type: 4,
            required: false,
            min_value: 1,
            max_value: 300,
          },
        ],
      },
    });
  }

  async execute({ message, args, pm }) {
    return this._handleForward(message, pm, args);
  }

  async slashExecute({ interaction, pm }) {
    const seconds   =interaction.options.getInteger('seconds');
    return this._handleForward(interaction, pm, seconds ? [seconds.toString()] : []);
  }

  async _handleForward(context, pm, args   =[]) {
    const { currentTrack } = pm;

    if (currentTrack.info.isStream) {
      return this._reply(context, this._createErrorContainer('Cannot forward a live stream.'));
    }

    let seconds   =10;
    if (args[0]) {
      const parsedSeconds   =parseInt(args[0]);
      if (isNaN(parsedSeconds) || parsedSeconds < 1 || parsedSeconds > 300) {
        return this._reply(context, this._createErrorContainer('Please provide a valid number of seconds between 1 and 300.'));
      }
      seconds   =parsedSeconds;
    }

    const newPosition   =await pm.forward(seconds * 1000);
    if (newPosition   ===false) {
      return this._reply(context, this._createErrorContainer('Unable to forward the track.'));
    }

    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Track Forwarded'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Position Updated**'),
          new TextDisplayBuilder().setContent(`*Forwarded ${seconds} seconds to ${this._formatDuration(newPosition / 1000)} / ${this._formatDuration(currentTrack.info.duration / 1000)}*`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(currentTrack.info.artworkUrl || config.assets.defaultTrackArtwork)),
    );

    return this._reply(context, container);
  }

  _formatDuration(durationInSeconds) {
    const minutes   =Math.floor(durationInSeconds / 60);
    const seconds   =Math.floor(durationInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  _createErrorContainer(message) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Error**\n*${message}*`),
    );
  }

  async _reply(context, container) {
    const payload   ={
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    if (context.reply) {
      return context.reply(payload);
    }
    return context.channel.send(payload);
  }
}

export default new ForwardCommand();
