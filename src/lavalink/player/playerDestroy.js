import { logger } from "#utils/logger";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";

export default class PlayerDestroy {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
    this.reconnectionQueue   =new Map();
  }

  async execute(player, reason) {
    logger.info("LavalinkPlayer", `🗑️ Player destroyed for guild: ${player.guildId} - ${reason}`);

    if (config.features.stay247) {
      try {
        await this.handle247Reconnection(player, reason);
      } catch (error) {
        logger.error("247Mode", "Error in playerDestroy 24/7 handling:", error);
      }
    }
  }

  async handle247Reconnection(player, reason) {
    const guildId   =player.guildId;


    if (this.reconnectionQueue.has(guildId)) {
      logger.debug("247Mode", `Reconnection already queued for guild ${guildId}, skipping`);
      return;
    }

    const guild247Settings   =db.guild.get247Settings(guildId);

    if (!guild247Settings.enabled || !guild247Settings.voiceChannel) {
      logger.debug("247Mode", `24/7 not enabled or no voice channel set for guild ${guildId}`);
      return;
    }

    const guild   =this.client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn("247Mode", `Guild ${guildId} not found for 24/7 reconnection`);
      return;
    }

    const voiceChannel   =guild.channels.cache.get(guild247Settings.voiceChannel);
    if (!voiceChannel || voiceChannel.type   !==2) {
      logger.warn("247Mode", `Invalid 24/7 voice channel ${guild247Settings.voiceChannel} for guild ${guild.name}`);
  
      db.guild.set247Mode(guildId, false);
      return;
    }


    const skipReconnectReasons   =[
      'manual_disconnect',
      'user_disconnect', 
      'leave_command',
      'stop_command',
      'destroy_command'
    ];

    if (skipReconnectReasons.some(skipReason   => reason.toLowerCase().includes(skipReason))) {
      logger.info("247Mode", `Player destroyed due to manual action (${reason}), but 24/7 enabled - will reconnect`);
    }

    logger.info("247Mode", `Player destroyed but 24/7 enabled - scheduling reconnection for guild ${guild.name}`);


    this.reconnectionQueue.set(guildId, Date.now());

    setTimeout(async ()   => {
      try {
        await this.attemptReconnection(guild, guild247Settings);
      } catch (error) {
        logger.error("247Mode", `Failed to reconnect 24/7 player for guild ${guild.name}:`, error);
      } finally {

        this.reconnectionQueue.delete(guildId);
      }
    }, config.player.stay247.reconnectDelay || 5000);
  }

  async attemptReconnection(guild, guild247Settings) {
    const guildId   =guild.id;


    const existingPlayer   =this.client.music?.getPlayer(guildId);
    if (existingPlayer && existingPlayer.voiceChannelId) {
      logger.debug("247Mode", `Player already exists for guild ${guild.name}, updating 24/7 flags instead of reconnecting`);
      existingPlayer.set('247Mode', true);
      existingPlayer.set('247VoiceChannel', guild247Settings.voiceChannel);
      existingPlayer.set('247TextChannel', guild247Settings.textChannel);
      return;
    }


    const voiceChannel   =guild.channels.cache.get(guild247Settings.voiceChannel);
    if (!voiceChannel || voiceChannel.type   !==2) {
      logger.warn("247Mode", `Voice channel ${guild247Settings.voiceChannel} no longer exists for guild ${guild.name}`);
      db.guild.set247Mode(guildId, false);
      return;
    }

    let textChannel   =guild.channels.cache.get(guild247Settings.textChannel);
    if (!textChannel || (textChannel.type   !==0 && textChannel.type   !==5)) {
      logger.debug("247Mode", `Text channel invalid for guild ${guild.name}, using voice channel as fallback`);
      textChannel   =voiceChannel;
    }


    const botMember   =guild.members.cache.get(this.client.user.id);
    if (!voiceChannel.permissionsFor(botMember).has(['Connect', 'Speak'])) {
      logger.warn("247Mode", `Missing permissions for voice channel ${voiceChannel.name} in guild ${guild.name}`);
      return;
    }


    const membersInChannel   =voiceChannel.members.filter(member   => !member.user.bot).size;
    if (membersInChannel   ===0 && config.player.stay247.requireMembers) {
      logger.info("247Mode", `No members in 24/7 channel ${voiceChannel.name} for guild ${guild.name}, skipping reconnection`);
      return;
    }

    try {
      logger.info("247Mode", `Attempting to reconnect to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`);

      const newPlayer   =this.client.music.createPlayer({
        guildId: guild.id,
        textChannelId: textChannel.id,
        voiceChannelId: voiceChannel.id,
        selfMute: false,
        selfDeaf: true,
        volume: db.guild.getDefaultVolume(guild.id)
      });

      await newPlayer.connect();


      newPlayer.set('247Mode', true);
      newPlayer.set('247VoiceChannel', voiceChannel.id);
      newPlayer.set('247TextChannel', textChannel.id);
      newPlayer.set('247ReconnectedAt', Date.now());
      newPlayer.set('247ReconnectionCount', (newPlayer.get('247ReconnectionCount') || 0) + 1);

      logger.success("247Mode", `Successfully reconnected to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`);


      if (config.player.stay247.announceReconnection && textChannel.type   ===0) {
        try {
          await textChannel.send({
            content: `🔄 **24/7 Mode:** Reconnected to ${voiceChannel.name}`,
            allowedMentions: { parse: [] }
          });
        } catch (msgError) {
          logger.debug("247Mode", `Could not send reconnection message to ${guild.name}:`, msgError.message);
        }
      }

    } catch (reconnectError) {
      logger.error("247Mode", `Failed to reconnect 24/7 player for guild ${guild.name}:`, reconnectError);


      if (!this.reconnectionFailures) {
        this.reconnectionFailures   =new Map();
      }

      const failCount   =(this.reconnectionFailures.get(guildId) || 0) + 1;
      this.reconnectionFailures.set(guildId, failCount);

      if (failCount >= 3) {
        logger.warn("247Mode", `Multiple reconnection failures for guild ${guild.name}, temporarily disabling 24/7 mode`);
        db.guild.set247Mode(guildId, false);
        this.reconnectionFailures.delete(guildId);


        if (config.player.stay247.notifyOnDisable && textChannel.type   ===0) {
          try {
            await textChannel.send({
              content: `⚠️ **24/7 Mode Disabled:** Multiple connection failures detected. Use \`247 on\` to re-enable when issues are resolved.`,
              allowedMentions: { parse: [] }
            });
          } catch (msgError) {
            logger.debug("247Mode", `Could not send disable notification to ${guild.name}`);
          }
        }
      }
    }
  }


  cleanupFailureTracking() {
    if (!this.reconnectionFailures) return;

    const now   =Date.now();
    const maxAge   =30 * 60 * 1000;

    for (const [guildId, timestamp] of this.reconnectionFailures.entries()) {
      if (now - timestamp > maxAge) {
        this.reconnectionFailures.delete(guildId);
      }
    }
  }
}
