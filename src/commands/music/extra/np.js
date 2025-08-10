import { AttachmentBuilder } from 'discord.js';

import { Command } from '#structures/classes/Command';
import MusicCard from '#structures/classes/MusicCard';
import { logger } from '#utils/logger';

class NowPlayingCommand extends Command {
  constructor() {
    super({
      name: 'nowplaying',
      description: 'Displays the currently playing song with a beautiful custom-designed visual card',
      usage: 'nowplaying',
      aliases: ['np'],
      category: 'music',
      examples: [
        'nowplaying',
        'np',
      ],
      cooldown: 10,
      voiceRequired: false,
      sameVoiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: 'nowplaying',
        description: 'Displays the currently playing song.',
      },
    });

    this.musicCard   =new MusicCard();
  }

  async execute({ client, message }) {
    return this._handleNowPlaying(client, message.guild.id, message);
  }

  async slashExecute({ client, interaction }) {
    return this._handleNowPlaying(client, interaction.guild.id, interaction);
  }

  async _handleNowPlaying(client, guildId, context) {
    const player   =client.music?.getPlayer(guildId);

    if (!player || !player.queue.current) {
      return this._replyError(context, 'There is nothing playing right now.');
    }

    await this._sendTyping(context);

    try {
      const track   =player.queue.current;

      const buffer   =await this.musicCard.createMusicCard(track, player.position);
      const attachment   =new AttachmentBuilder(buffer, { name: 'yukihana-nowplaying.png' });

      await this._reply(context, { files: [attachment] });
    } catch (error) {
      client.logger?.error('NowPlayingCommand', `Failed to create or send canvas: ${error.message}`, error);
      return this._replyError(context, 'An error occurred while creating the Now Playing card.');
    }
  }

  async _reply(context, payload) {
    try {
      if (context.interaction) {
        await context.interaction.editReply(payload);
      } else if (context.message) {
        await context.message.channel.send(payload);
      } else if (context.deferred || context.replied) {
        await context.editReply(payload);
      } else {
        await context.reply(payload);
      }
    } catch (error) {
      logger.error('NowPlayingCommand', 'Failed to send reply in NowPlaying command:', error);
    }
  }

  async _replyError(context, message) {
    const payload   ={ content: `❄️ **Error:** ${message}`, ephemeral: true };
    if (context.interaction) {
      if (context.interaction.deferred || context.interaction.replied) {
        return context.interaction.editReply(payload);
      }
      return context.interaction.reply(payload);
    } else if (context.message) {
      return context.message.reply(payload);
    }
    return context.reply(payload);
  }

  async _sendTyping(context) {
    try {
      if (context.interaction) {
        await context.interaction.deferReply();
      } else if (context.message) {
        await context.message.channel.sendTyping();
      }
    } catch {
    }
  }
}

export default new NowPlayingCommand();
