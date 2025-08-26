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
import emoji from '#config/emoji';

class ReplayCommand extends Command {
  constructor() {
    super({
      name: 'replay',
      description: 'Replay the current track from the beginning (not available for live streams)',
      usage: 'replay',
      aliases: ['restart'],
      category: 'music',
      examples: [
        'replay',
        'restart',
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'replay',
        description: 'Replay the current track from the beginning',
      },
    });
  }

  async execute({ message, pm }) {
    return this._handleReplay(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleReplay(interaction, pm);
  }

  async _handleReplay(context, pm) {
    const { currentTrack } = pm;

    if (currentTrack.info.isStream) {
      return this._reply(context, this._createErrorContainer('Cannot replay a live stream.'));
    }

    await pm.replay();

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('music')} **Track Replayed**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Track Information**\n\n` +
      `├─ **${emoji.get('music')} Title:** ${currentTrack.info.title}\n` +
      `├─ **${emoji.get('folder')} Artist:** ${currentTrack.info.author || 'Unknown'}\n` +
      `├─ **${emoji.get('info')} Duration:** ${this._formatDuration(currentTrack.info.duration)}\n` +
      `└─ **${emoji.get('check')} Status:** Restarted from beginning\n\n` +
      `*Track has been replayed from the start*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(currentTrack.info.artworkUrl || config.assets.defaultTrackArtwork)
        )
    );

    if (currentTrack.requester?.id) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const requesterContent = `**Request Information**\n\n` +
        `├─ **${emoji.get('add')} Requested by:** <@${currentTrack.requester.id}>\n` +
        `├─ **${emoji.get('reset')} Action:** Track replayed\n` +
        `└─ **${emoji.get('check')} Status:** Now playing from start\n\n` +
        `*Original request information preserved*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(requesterContent)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork)
          )
      );
    }

    return this._reply(context, container);
  }

  _formatDuration(duration) {
    if (!duration || duration < 0) return 'Live';
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  _createErrorContainer(message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('cross')} **Error**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Something went wrong**\n\n` +
      `├─ **${emoji.get('info')} Issue:** ${message}\n` +
      `└─ **${emoji.get('reset')} Action:** Try again or contact support\n\n` +
      `*Please check your input and try again*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork)
        )
    );

    return container;
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    if (context.reply) {
      return context.reply(payload);
    }
    return context.channel.send(payload);
  }
}

export default new ReplayCommand();