import { logger } from "#utils/logger";
import { EventUtils } from "../utils/EventUtils.js";

export default class TrackError {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
  }

  async execute(player, track, payload) {
    try {
      const errorInfo   ={
        message: payload.error || payload.exception?.message || 'Unknown error',
        severity: payload.exception?.severity || 'UNKNOWN',
        cause: payload.exception?.cause || 'Unknown cause',
        track: track?.info?.title || 'Unknown Track',
        guildId: player.guildId
      };

      logger.error('TrackError', `Track playback error in guild ${player.guildId}:`, errorInfo);

      const messageId   =player.get('nowPlayingMessageId');
      const channelId   =player.get('nowPlayingChannelId');

      if (messageId && channelId) {
        try {
          const channel   =this.client.channels.cache.get(channelId);
          const message   =await channel?.messages.fetch(messageId).catch(()   => null);

          if (message) {
            await message.edit({
              content: `❌ **Playback Error**\n~~${EventUtils.formatTrackInfo(track)}~~\n*${errorInfo.message}*`,
              files: []
            });
          }
        } catch (editError) {
          logger.warn('TrackError', 'Could not edit now playing message:', editError);
        }
      }

      let userMessage;
      if (errorInfo.severity   ==='COMMON') {
        userMessage   =`⚠️ **Unable to play this track.** Skipping to next song...`;
      } else if (errorInfo.severity   ==='SUSPICIOUS') {
        userMessage   =`🚫 **This track cannot be played** due to restrictions. Skipping...`;
      } else {
        userMessage   =`❌ **Playback failed:** ${errorInfo.message}\nSkipping to next track...`;
      }

      const errorMessage   =await EventUtils.sendPlayerMessage(this.client, player, {
        content: userMessage
      });

      if (errorMessage && errorMessage.id) {
        player.set('errorMessageId', errorMessage.id);
      }

      setTimeout(async ()   => {
        try {
          if (player.queue.current && player.queue.current.info.identifier   ===track?.info?.identifier) {
            logger.info('TrackError', `Auto-skipping errored track: ${track?.info?.title}`);
            await player.skip();
          }
        } catch (skipError) {
          logger.error('TrackError', 'Failed to auto-skip errored track:', skipError);
        }
      }, 3000);

    } catch (error) {
      logger.error('TrackError', 'Error in trackError event handler:', error);

      try {
        await EventUtils.sendPlayerMessage(this.client, player, {
          content: `❌ **Critical playback error occurred.** Please try again.`
        });
      } catch (fallbackError) {
        logger.error('TrackError', 'Even fallback error message failed:', fallbackError);
      }
    }
  }
}
