import { PermissionFlagsBits } from 'discord.js';

import { db } from '#database/DatabaseManager';
import { logger } from '#utils/logger';

export default {
  name: '247',
  aliases: ['stay247', 'alwayson', 'keepalive', '24/7'],
  description: 'Toggle 24/7 mode to keep the bot connected to a voice channel',
  category: 'settings',
  usage: '247 [on/off]',
  examples: [
    '247 - Show current status',
    '247 on - Enable 24/7 mode in your current voice channel',
    '247 off - Disable 24/7 mode',
  ],
  cooldown: 5,
  userPermissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],

  async execute({ message, args }) {
    try {
      const guildId   =message.guild.id;
      const current247Settings   =db.guild.get247Settings(guildId);


      if (args.length === 0) {
        return await this.showStatus(message, current247Settings);
      }

      const action   =args[0].toLowerCase();

      if (['on', 'enable', 'true', 'start'].includes(action)) {
        return await this.enable247Mode(message, current247Settings);
      } else if (['off', 'disable', 'false', 'stop'].includes(action)) {
        return await this.disable247Mode(message, current247Settings);
      }
      return message.reply({
        content: '❌ **Invalid option.** Use: `247 on` or `247 off`.\n\nFor more help, use: `help 247`',
      });
    } catch (error) {
      logger.error('247Command', 'Error in 24/7 command:', error);
      return message.reply({
        content: `❌ **An error occurred while changing 24/7 settings.** Please try again later.`,
      });
    }
  },

  async showStatus(message, current247Settings) {
    const { guild }   =message;
    let statusText;

    if (current247Settings.enabled) {
      const voiceChannel   =current247Settings.voiceChannel
        ? guild.channels.cache.get(current247Settings.voiceChannel)
        : null;
      const textChannel   =current247Settings.textChannel
        ? guild.channels.cache.get(current247Settings.textChannel)
        : null;

      statusText   =`🟢 **24/7 Mode: ENABLED**
📍 **Voice Channel:** ${voiceChannel ? `${ voiceChannel.name} (${voiceChannel})` : '⚠️ Channel not found' }
💬 **Text Channel:** ${textChannel ? `${ textChannel.name} (${textChannel})` : '📍 Same as voice channel' }
🔄 **Auto Disconnect:** ${current247Settings.autoDisconnect ? 'Disabled' : 'Enabled'}`;
    } else {
      statusText   =`🔴 **24/7 Mode: DISABLED**
🔄 **Auto Disconnect:** ${current247Settings.autoDisconnect ? 'Enabled' : 'Disabled'}`;
    }

    const player   =message.client.music?.getPlayer(guild.id);
    const connectionStatus   =player && player.voiceChannelId
      ? `🎵 **Currently Connected:** <#${player.voiceChannelId}>`
      : `🔇 **Currently:** Not connected`;

    return message.reply({
      embeds: [{
        title: '🎵 24/7 Mode Status',
        description: `${statusText}\n\n${connectionStatus}`,
        color: current247Settings.enabled ? 0x00ff00 : 0xff0000,
        footer: {
          text: 'Use "247 on" to enable • "247 off" to disable',
        },
      }],
    });
  },

  async enable247Mode(message, current247Settings) {
    const { guild, member, channel }   =message;


    const targetVoiceChannel   =member.voice?.channel;
    const targetTextChannel   =channel;


    if (!targetVoiceChannel) {
      return message.reply({
        content: '❌ **You must be in a voice channel to enable 24/7 mode.**',
      });
    }


    const botMember   =guild.members.cache.get(message.client.user.id);
    const voicePerms   =targetVoiceChannel.permissionsFor(botMember);

    if (!voicePerms.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      return message.reply({
        content: `❌ **Missing permissions for ${targetVoiceChannel.name}.**\nI need \`Connect\` and \`Speak\` permissions in that voice channel.`,
      });
    }


    const textPerms   =targetTextChannel.permissionsFor(botMember);
    if (!textPerms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return message.reply({
        content: `❌ **Missing permissions for ${targetTextChannel.name}.**\nI need \`View Channel\` and \`Send Messages\` permissions in that text channel.`,
      });
    }

    try {
      db.guild.set247Mode(guild.id, true, targetVoiceChannel.id, targetTextChannel.id);
      logger.info('247Command', `24/7 mode enabled in guild ${guild.id} - Voice: ${targetVoiceChannel.id}, Text: ${targetTextChannel.id}`);


      let player   =message.client.music?.getPlayer(guild.id);
      let connectionMessage   ='';

      if (!player || !player.voiceChannelId) {
        try {
          player   =message.client.music.createPlayer({
            guildId: guild.id,
            textChannelId: targetTextChannel.id,
            voiceChannelId: targetVoiceChannel.id,
            selfMute: false,
            selfDeaf: true,
            volume: db.guild.getDefaultVolume(guild.id),
          });

          await player.connect();
          connectionMessage   ='\n🔗 **Connected to voice channel**';
        } catch (connectError) {
          logger.error('247Command', `Failed to connect to voice channel:`, connectError);
          connectionMessage   ='\n⚠️ **Failed to connect - will retry automatically**';
        }
      } else if (player.voiceChannelId   !==targetVoiceChannel.id) {
        try {
          await player.setVoiceChannel(targetVoiceChannel.id);
          connectionMessage   ='\n🔄 **Moved to new voice channel**';
        } catch (moveError) {
          logger.error('247Command', `Failed to move to new voice channel:`, moveError);
          connectionMessage   ='\n⚠️ **Failed to move - will reconnect automatically**';
        }
      }


      return message.reply({
        embeds: [{
          title: '✅ 24/7 Mode Enabled',
          description: `📍 **Voice Channel:** ${targetVoiceChannel.name}
💬 **Text Channel:** ${targetTextChannel.name}
🔄 **Status:** Bot will stay connected even when queue is empty${connectionMessage}`,
          color: 0x00ff00,
          footer: {
            text: 'The bot will automatically reconnect if disconnected',
          },
        }],
      });
    } catch (error) {
      logger.error('247Command', 'Error enabling 24/7 mode:', error);
      return message.reply({
        content: '❌ **Failed to enable 24/7 mode.** Please try again later.',
      });
    }
  },

  async disable247Mode(message, current247Settings) {
    const { guild }   =message;
    const guildId   =guild.id;

    if (!current247Settings.enabled) {
      return message.reply({
        content: '❌ **24/7 mode is already disabled.**',
      });
    }

    try {
      db.guild.set247Mode(guildId, false);
      logger.info('247Command', `24/7 mode disabled in guild ${guildId}`);


      const player   =message.client.music?.getPlayer(guildId);
      const disconnectionMessage   ='';


      return message.reply({
        embeds: [{
          title: '✅ 24/7 Mode Disabled',
          description: `🔄 **Status:** Bot will disconnect when queue is empty${disconnectionMessage}`,
          color: 0xff6b6b,
          footer: {
            text: 'Use "247 on" to re-enable 24/7 mode',
          },
        }],
      });
    } catch (error) {
      logger.error('247Command', 'Error disabling 24/7 mode:', error);
      return message.reply({
        content: '❌ **Failed to disable 24/7 mode.** Please try again later.',
      });
    }
  },
};
