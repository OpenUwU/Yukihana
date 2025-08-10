import { config } from '#config/config';
import { db } from '#database/DatabaseManager';
import { Command } from '#structures/classes/Command';
import { logger } from '#utils/logger';

class AutoplayCommand extends Command {
  constructor() {
    super({
      name: 'autoplay',
      description: 'Toggle autoplay feature that adds similar songs when queue ends',
      usage: 'autoplay [on|off]',
      aliases: ['ap', 'auto'],
      category: 'music',
      examples: [
        'autoplay',
        'autoplay on',
        'autoplay off',
        'ap',
      ],
      cooldown: 5,
      voiceRequired: false,
      sameVoiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: 'autoplay',
        description: 'Toggle autoplay feature that adds similar songs when queue ends',
        options: [
          {
            name: 'state',
            description: 'Turn autoplay on or off',
            type: 3,
            required: false,
            choices: [
              { name: 'On', value: 'on' },
              { name: 'Off', value: 'off' },
            ],
          },
        ],
      },
    });
  }

  async execute({ client, message, args }) {
    const state   =args[0]?.toLowerCase();
    return this._handleAutoplay(client, message.guild.id, message, state);
  }

  async slashExecute({ client, interaction }) {
    const state   =interaction.options.getString('state');
    return this._handleAutoplay(client, interaction.guild.id, interaction, state);
  }

  async _handleAutoplay(client, guildId, context, state) {
    const player   =client.music?.getPlayer(guildId);
    const currentStatus   =player?.get('autoplayEnabled') || false;

    let newStatus;
    if (state   ==='on' || state   ==='enable' || state   ==='true') {
      newStatus   =true;
    } else if (state   ==='off' || state   ==='disable' || state   ==='false') {
      newStatus   =false;
    } else {
      newStatus   =!currentStatus;
    }

    if (player) {
      player.set('autoplayEnabled', newStatus);
      player.set('autoplaySetBy', context.user?.id || context.author?.id);
    }

    const userId   =context.user?.id || context.author?.id;
    const premiumStatus   =this._getPremiumStatus(guildId, userId);
    const statusText   =newStatus ? 'Enabled' : 'Disabled';
    const statusEmoji   =newStatus ? '🟢' : '🔴';

    const content   =[
      `**Autoplay is now ${statusText} ${statusEmoji}**`,
      "When your queue ends, I'll find similar songs to the last track and add them automatically.",
      '',
      premiumStatus.hasPremium
        ? `**✨ Premium:** Adds up to 10 similar songs`
        : `**Free:** Adds up to 6 similar songs`,
    ].join('\n');

    logger.info('AutoplayCommand', `Autoplay ${newStatus ? 'enabled' : 'disabled'} in guild ${guildId}`);

    return this._reply(context, { content });
  }

  _getPremiumStatus(guildId, userId) {
    const premiumStatus   =db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: Boolean(premiumStatus),
      type: premiumStatus ? premiumStatus.type : 'free',
      maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free,
    };
  }

  async _reply(context, { content }) {
    const payload   ={ content, fetchReply: true };

    try {
      if (context.replied || context.deferred) {
        return context.editReply(payload);
      }
      return context.reply(payload);
    } catch (error) {
      logger.error('AutoplayCommand', 'Failed to reply in autoplay command:', error);
      return null;
    }
  }
}

export default new AutoplayCommand();
