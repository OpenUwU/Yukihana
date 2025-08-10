import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#structures/classes/Command';
import { logger } from '#utils/logger';

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
    const song   =await pm.grab();

    if (!song) {
      return this._reply(context, this._createErrorContainer('There is no song to grab.'));
    }

    const dmContainer   =new ContainerBuilder();
    dmContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### 🎵 Grabbed Song'),
    );

    dmContainer.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**[${song.info.title}](${song.info.uri})**\n*by ${song.info.author || 'Unknown'}* \n⏱️ **Duration:** ${song.info.isStream ? 'LIVE' : this._formatDuration(song.info.duration)}\n👤 **Requested by:** ${this._getRequesterMention(song.requester)}`),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(song.info.artworkUrl || config.assets.defaultTrackArtwork),
        ),
    );

    try {
      if (!user.dmChannel) {
        await user.createDM();
      }

      const dmPayload   ={
        components: [dmContainer],
        flags: MessageFlags.IsComponentsV2,
      };

      await user.send(dmPayload);

      const successContainer   =new ContainerBuilder();
      successContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### ✅ Song Grabbed'),
      );

      successContainer.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('The current song has been sent to your DMs!'),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(song.info.artworkUrl || config.assets.defaultTrackArtwork),
          ),
      );

      return this._reply(context, successContainer);
    } catch (error) {
      logger.error('GrabCommand', 'DM Error:', error);

      let errorMessage   ='Unable to send DM.';

      if (error.code   ===50007) {
        errorMessage   ='Unable to send DM. You have DMs disabled or have blocked the bot.';
      } else if (error.code   ===50001) {
        errorMessage   ='Unable to send DM. Missing access permissions.';
      } else if (error.code   ===10013) {
        errorMessage   ='Unable to send DM. User not found.';
      } else if (error.message?.includes('Cannot send messages to this user')) {
        errorMessage   ='Unable to send DM. Please check your privacy settings or ensure you share a server with the bot.';
      } else {
        errorMessage   =`Unable to send DM: ${error.message || 'Unknown error'}`;
      }

      return this._reply(context, this._createErrorContainer(errorMessage));
    }
  }

  _formatDuration(duration) {
    if (!duration || duration < 0) return 'Live';
    const hours   =Math.floor(duration / 3600000);
    const minutes   =Math.floor((duration % 3600000) / 60000);
    const seconds   =Math.floor((duration % 60000) / 1000);

    return `${hours > 0 ? `${ hours.toString().padStart(2, '0')}:` : '' }${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  _getRequesterMention(requester) {
    if (typeof requester   ==='object' && requester   !==null && 'id' in requester) {
      return `<@${requester.id}>`;
    }
    return 'Unknown';
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

export default new GrabCommand();
