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

class PreviousCommand extends Command {
  constructor() {
    super({
      name: 'previous',
      description: 'Play the previous track from the queue history',
      usage: 'previous',
      aliases: ['prev', 'back'],
      category: 'music',
      examples: [
        'previous',
        'prev',
        'back',
      ],
      cooldown: 2,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'previous',
        description: 'Play the previous track from the queue history',
      },
    });
  }

  async execute({ message, pm }) {
    return this._handlePrevious(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handlePrevious(interaction, pm);
  }

  async _handlePrevious(context, pm) {
    if (pm.previousTracks.length   ===0) {
      return this._reply(context, this._createErrorContainer('There is no previous track in the history.'));
    }

    const success   =await pm.playPrevious();

    if (!success) {
      return this._reply(context, this._createErrorContainer('Could not play the previous track.'));
    }

    const previousTrack   =pm.currentTrack;
    if (!previousTrack) {
      return this._reply(context, this._createErrorContainer('Could not retrieve the previous track info.'));
    }

    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Playing Previous Track`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const section   =new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**[${previousTrack.info.title}](${previousTrack.info.uri})**`),
        new TextDisplayBuilder().setContent(`*by ${previousTrack.info.author || 'Unknown'} | ${this._formatDuration(previousTrack.info.duration)}*`),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(previousTrack.info.artworkUrl || config.assets.defaultTrackArtwork));

    container.addSectionComponents(section);

    return this._reply(context, container);
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return 'Live';
    const seconds   =Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
    const minutes   =Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, '0');
    const hours   =Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
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

export default new PreviousCommand();
