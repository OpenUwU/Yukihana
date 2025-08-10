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

    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Queue Shuffled'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const { currentTrack } = pm;
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Queue Randomized**'),
          new TextDisplayBuilder().setContent(`*Successfully shuffled ${pm.queueSize} tracks in the queue*`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork)),
    );

    return this._reply(context, container);
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

export default new ShuffleCommand();
