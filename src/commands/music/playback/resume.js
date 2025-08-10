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

class ResumeCommand extends Command {
  constructor() {
    super({
      name: 'resume',
      description: 'Resume the paused track and continue playback',
      usage: 'resume',
      aliases: ['unpause'],
      category: 'music',
      examples: [
        'resume',
        'unpause',
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'resume',
        description: 'Resume the paused track',
      },
    });
  }

  async execute({ message, pm }) {
    return this._handleResume(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleResume(interaction, pm);
  }

  async _handleResume(context, pm) {
    if (!pm.isPaused) {
      return this._reply(context, this._createErrorContainer('The player is not paused.'));
    }

    await pm.resume();

    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Player Resumed'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const { currentTrack } = pm;
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Playback Resumed**'),
          new TextDisplayBuilder().setContent(`*[${currentTrack.info.title}](${currentTrack.info.uri}) is now playing*`),
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

export default new ResumeCommand();
