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
import emoji from '#config/emoji';

class GrabCommand extends Command {
  constructor() {
    super({
      name: 'grab',
      description: 'Grab the currently playing song and send it to your DMs for later use',
      usage: 'grab',
      aliases: ['save'],
      category: 'music',
      examples: [
        'grab',
        'save',
      ],
      cooldown: 3,
      voiceRequired: false,
      sameVoiceRequired: false,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'grab',
        description: 'Grab the currently playing song and send it to your DMs',
      },
    });
  }

  async execute({ message, pm }) {
    return this._handleGrab(message, message.author, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleGrab(interaction, interaction.user, pm);
  }

  async _handleGrab(context, user, pm) {
    const song = await pm.grab();

    if (!song) {
      return this._reply(context, this._createErrorContainer('There is no song to grab.'));
    }

    const dmContainer = this._createDMContainer(song);

    try {
      if (!user.dmChannel) {
        await user.createDM();
      }

      const dmPayload = {
        components: [dmContainer],
        flags: MessageFlags.IsComponentsV2,
      };

      await user.send(dmPayload);

      const successContainer = this._createSuccessContainer(song);
      return this._reply(context, successContainer);
    } catch (error) {
      logger.error('GrabCommand', 'DM Error:', error);

      let errorMessage = 'Unable to send DM.';

      if (error.code === 50007) {
        errorMessage = 'Unable to send DM. You have DMs disabled or have blocked the bot.';
      } else if (error.code === 50001) {
        errorMessage = 'Unable to send DM. Missing access permissions.';
      } else if (error.code === 10013) {
        errorMessage = 'Unable to send DM. User not found.';
      } else if (error.message?.includes('Cannot send messages to this user')) {
        errorMessage = 'Unable to send DM. Please check your privacy settings or ensure you share a server with the bot.';
      } else {
        errorMessage = `Unable to send DM: ${error.message || 'Unknown error'}`;
      }

      return this._reply(context, this._createErrorContainer(errorMessage));
    }
  }

  _createDMContainer(song) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('music')} **Grabbed Song**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**You saved this track for later**\n\n` +
      `**${emoji.get('folder')} Track Details**\n` +
      `├─ **[${song.info.title}](${song.info.uri})**\n` +
      `├─ Artist: ${song.info.author || 'Unknown'}\n` +
      `├─ Duration: ${song.info.isStream ? 'LIVE' : this._formatDuration(song.info.duration)}\n` +
      `└─ Requested by: ${this._getRequesterMention(song.requester)}\n\n` +
      `**${emoji.get('info')} Quick Actions**\n` +
      `├─ Copy the link above to share with friends\n` +
      `├─ Use the title to search on other platforms\n` +
      `├─ Save to your personal music library\n` +
      `└─ Add to playlists for future listening`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(song.info.artworkUrl || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createSuccessContainer(song) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('check')} **Song Grabbed**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Track successfully saved to your DMs**\n\n` +
      `**${emoji.get('music')} Grabbed Track**\n` +
      `├─ **[${song.info.title}](${song.info.uri})**\n` +
      `├─ Artist: ${song.info.author || 'Unknown'}\n` +
      `├─ Duration: ${song.info.isStream ? 'LIVE' : this._formatDuration(song.info.duration)}\n` +
      `└─ Saved to your private messages\n\n` +
      `**${emoji.get('folder')} What's Next?**\n` +
      `├─ Check your DMs for the full track details\n` +
      `├─ Track link and information preserved\n` +
      `├─ Easy access for future reference\n` +
      `└─ Share or save to your music collection`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(song.info.artworkUrl || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

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

  _formatDuration(duration) {
    if (!duration || duration < 0) return 'Live';
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    return `${hours > 0 ? `${hours.toString().padStart(2, '0')}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  _getRequesterMention(requester) {
    if (typeof requester === 'object' && requester !== null && 'id' in requester) {
      return `<@${requester.id}>`;
    }
    return 'Unknown';
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

export default new GrabCommand();