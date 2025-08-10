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

class PauseCommand extends Command {
  constructor() {
    super({
      name: 'pause',
      description: 'Pause the currently playing track',
      usage: 'pause',
      aliases: ['pa'],
      category: 'music',
      examples: [
        'pause',
        'pa',
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'pause',
        description: 'Pause the current track',
      },
    });
  }

  async execute({ message, pm }) {
    return this._handlePause(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handlePause(interaction, pm);
  }

  async _handlePause(context, pm) {
    if (pm.isPaused) {
      return this._reply(context, this._createErrorContainer('The player is already paused.'));
    }

    await pm.pause();

    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Player Paused'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const { currentTrack } = pm;
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**Playback Paused**'),
          new TextDisplayBuilder().setContent(`*[${currentTrack.info.title}](${currentTrack.info.uri}) has been paused*`),
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

export default new PauseCommand();
