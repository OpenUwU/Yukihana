import { PlayerManager } from '#managers/PlayerManager';
import { logger } from '#utils/logger';

export default class VoiceStateUpdate {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;

    this.aloneTimeouts   =new Map();
    this.muteStates   =new Map();
  }

  async execute(oldState, newState) {
    try {
      const guildId   =newState.guild.id;
      const player   =this.client.music?.getPlayer(guildId);

      if (!player) return;

      const pm   =new PlayerManager(player);
      const botMember   =newState.guild.members.me;

      if (newState.id   ===this.client.user.id) {
        await this._handleBotVoiceStateChange(oldState, newState, pm, botMember);
        return;
      }

      await this._handleUserVoiceStateChange(oldState, newState, pm, botMember);

    } catch (error) {
      logger.error('VoiceStateUpdate', 'Error in voice state update handler:', error);
    }
  }

  async _handleBotVoiceStateChange(oldState, newState, pm, botMember) {
    const guildId   =newState.guild.id;

    if (oldState.channelId && !newState.channelId) {
      logger.info('VoiceStateUpdate', `Bot disconnected from voice channel in guild ${guildId}`);

      this._clearAloneTimeout(guildId);

      await this._destroyPlayer(pm, 'Bot disconnected from voice channel');
      return;
    }

    if (oldState.channelId && newState.channelId && oldState.channelId   !==newState.channelId) {
      logger.info('VoiceStateUpdate', `Bot moved from ${oldState.channelId} to ${newState.channelId} in guild ${guildId}`);

      try {
        await pm.changeVoiceState({ channelId: newState.channelId });
      } catch (error) {
        logger.error('VoiceStateUpdate', 'Error updating voice state after channel move:', error);
      }

      await this._checkIfAlone(newState, pm);
    }

    await this._handleMuteStateChange(oldState, newState, pm);
  }

  async _handleUserVoiceStateChange(oldState, newState, pm, botMember) {
    const guildId   =newState.guild.id;
    const botVoiceChannelId   =botMember?.voice?.channelId;

    if (!botVoiceChannelId) return;

    if (oldState.channelId   ===botVoiceChannelId && newState.channelId   !==botVoiceChannelId) {
      logger.debug('VoiceStateUpdate', `User ${newState.id} left bot's voice channel in guild ${guildId}`);
      await this._checkIfAlone(botMember.voice, pm);
    }

    if (oldState.channelId   !==botVoiceChannelId && newState.channelId   ===botVoiceChannelId) {
      logger.debug('VoiceStateUpdate', `User ${newState.id} joined bot's voice channel in guild ${guildId}`);

      this._clearAloneTimeout(guildId);

      if (pm.isPaused && pm.getData('pausedDueToAlone')) {
        await pm.resume();
        pm.setData('pausedDueToAlone', false);
        logger.info('VoiceStateUpdate', `Resumed playback in guild ${guildId} - users rejoined`);
      }
    }
  }

  async _handleMuteStateChange(oldState, newState, pm) {
    const guildId   =newState.guild.id;
    const wasServerMuted   =oldState.serverMute;
    const isServerMuted   =newState.serverMute;
    const wasSelfMuted   =oldState.selfMute;
    const isSelfMuted   =newState.selfMute;

    const previousMuteState   =this.muteStates.get(guildId) || { serverMute: false, selfMute: false };
    const currentMuteState   ={ serverMute: isServerMuted, selfMute: isSelfMuted };
    this.muteStates.set(guildId, currentMuteState);

    const wasMuted   =previousMuteState.serverMute || previousMuteState.selfMute;
    const isMuted   =isServerMuted || isSelfMuted;

    if (!wasMuted && isMuted) {
      if (pm.isPlaying) {
        await pm.pause();
        pm.setData('pausedDueToMute', true);

        const muteType   =isServerMuted ? 'server-muted' : 'self-muted';
        logger.info('VoiceStateUpdate', `Paused playback in guild ${guildId} - bot was ${muteType}`);

        await this._sendMuteNotification(pm, true, muteType);
      }
    } else if (wasMuted && !isMuted) {
      if (pm.isPaused && pm.getData('pausedDueToMute')) {
        await pm.resume();
        pm.setData('pausedDueToMute', false);
        logger.info('VoiceStateUpdate', `Resumed playback in guild ${guildId} - bot was unmuted`);

        await this._sendMuteNotification(pm, false);
      }
    }
  }

  async _checkIfAlone(voiceState, pm) {
    const guildId   =voiceState.guild.id;
    const channel   =voiceState.channel;

    if (!channel) return;

    const humanMembers   =channel.members.filter(member   => !member.user.bot);

    if (humanMembers.size   ===0) {
      logger.info('VoiceStateUpdate', `Bot is alone in voice channel in guild ${guildId}`);

      this._clearAloneTimeout(guildId);

      if (pm.isPlaying) {
        await pm.pause();
        pm.setData('pausedDueToAlone', true);
        logger.info('VoiceStateUpdate', `Paused playback in guild ${guildId} - alone in voice channel`);
      }

      const timeout   =setTimeout(async ()   => {
        try {
          const currentChannel   =voiceState.guild.members.me?.voice?.channel;
          if (currentChannel) {
            const currentHumanMembers   =currentChannel.members.filter(member   => !member.user.bot);
            if (currentHumanMembers.size   ===0) {
              logger.info('VoiceStateUpdate', `Destroying player in guild ${guildId} - alone for 10 seconds`);
              await this._destroyPlayer(pm, 'Alone in voice channel for 10 seconds');
            }
          }
        } catch (error) {
          logger.error('VoiceStateUpdate', 'Error in alone timeout handler:', error);
        } finally {
          this.aloneTimeouts.delete(guildId);
        }
      }, 10000);

      this.aloneTimeouts.set(guildId, timeout);
    } else {
      this._clearAloneTimeout(guildId);
    }
  }

  _clearAloneTimeout(guildId) {
    const existingTimeout   =this.aloneTimeouts.get(guildId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.aloneTimeouts.delete(guildId);
      logger.debug('VoiceStateUpdate', `Cleared alone timeout for guild ${guildId}`);
    }
  }

  async _destroyPlayer(pm, reason) {
    try {
      const guildId   =pm.guildId;


      const is247Enabled   =await pm.is247ModeEnabled();

      if (is247Enabled) {
        logger.info('VoiceStateUpdate', `24/7 mode enabled in guild ${guildId} - stopping player instead of destroying: ${reason}`);


        await pm.stop();


        await this._send247StopNotification(pm, reason);


        this._clearAloneTimeout(guildId);
        this.muteStates.delete(guildId);

        return;
      }


      await this._sendDisconnectNotification(pm, reason);

      this._clearAloneTimeout(guildId);
      this.muteStates.delete(guildId);

      await pm.destroy(reason, true);

      logger.info('VoiceStateUpdate', `Player destroyed in guild ${guildId}: ${reason}`);
    } catch (error) {
      logger.error('VoiceStateUpdate', 'Error destroying player:', error);
    }
  }

  async _sendMuteNotification(pm, isMuted, muteType   =null) {
    try {
      const textChannelId   =pm.textChannelId;
      if (!textChannelId) return;

      const channel   =this.client.channels.cache.get(textChannelId);
      if (!channel) return;

      let message;
      if (isMuted) {
        const type   =muteType   ==='server-muted' ? 'server-muted' : 'muted';
        message   =`⏸️ **Music paused** - Bot was ${type}`;
      } else {
        message   =`▶️ **Music resumed** - Bot was unmuted`;
      }

      await channel.send(message);
    } catch (error) {
      logger.error('VoiceStateUpdate', 'Error sending mute notification:', error);
    }
  }

  async _send247StopNotification(pm, reason) {
    try {
      const textChannelId   =pm.textChannelId;
      if (!textChannelId) return;

      const channel   =this.client.channels.cache.get(textChannelId);
      if (!channel) return;

      let message;
      switch (reason) {
        case 'Alone in voice channel for 10 seconds':
          message   ='⏹️ **Music stopped** - I was alone in the voice channel (24/7 mode active)';
          break;
        case 'Bot disconnected from voice channel':
          message   ='⏹️ **Music stopped** - I was removed from the voice channel (24/7 mode active)';
          break;
        default:
          message   =`⏹️ **Music stopped** - ${reason} (24/7 mode active)`;
          break;
      }

      await channel.send(message);
    } catch (error) {
      logger.error('VoiceStateUpdate', 'Error sending 247 stop notification:', error);
    }
  }

  async _sendDisconnectNotification(pm, reason) {
    try {
      const textChannelId   =pm.textChannelId;
      if (!textChannelId) return;

      const channel   =this.client.channels.cache.get(textChannelId);
      if (!channel) return;

      let message;
      switch (reason) {
        case 'Alone in voice channel for 10 seconds':
          message   ='👋 **Disconnected** - I was alone in the voice channel for too long';
          break;
        case 'Bot disconnected from voice channel':
          message   ='🔌 **Disconnected** - I was removed from the voice channel';
          break;
        default:
          message   =`🔌 **Disconnected** - ${reason}`;
          break;
      }

      await channel.send(message);
    } catch (error) {
      logger.error('VoiceStateUpdate', 'Error sending disconnect notification:', error);
    }
  }

  cleanup() {
    for (const [guildId, timeout] of this.aloneTimeouts) {
      clearTimeout(timeout);
      logger.debug('VoiceStateUpdate', `Cleared timeout for guild ${guildId} during cleanup`);
    }
    this.aloneTimeouts.clear();
    this.muteStates.clear();
  }
}
