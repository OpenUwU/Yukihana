import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";

export default {
  name: "trackEnd",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      const endReason = payload.reason || 'FINISHED';

      logger.debug('TrackEnd', `Track ended in guild ${player.guildId}:`, {
        track: track?.info?.title || 'Unknown',
        reason: endReason,
        guildId: player.guildId
      });

      const messageId = player.get('nowPlayingMessageId');
      const channelId = player.get('nowPlayingChannelId');
      const stuckWarningId = player.get('stuckWarningMessageId');
      const errorMessageId = player.get('errorMessageId');
      const stuckTimeoutId = player.get('stuckTimeoutId');

      EventUtils.clearPlayerTimeout(player, 'stuckTimeoutId');

      if (messageId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const message = await channel?.messages.fetch(messageId).catch(() => null);

          if (message) {
            switch (endReason) {
              case 'FINISHED':
                await message.edit({
                  content: `✅ **Finished:** ~~${EventUtils.formatTrackInfo(track)}~~`,
                  files: []
                });

                setTimeout(async () => {
                  try {
                    await message.delete().catch(() => {});
                  } catch (deleteError) {
                    logger.debug('TrackEnd', 'Could not delete finished message:', deleteError);
                  }
                }, 5000);
                break;

              case 'REPLACED':
                await message.delete().catch(() => {});
                break;

              case 'STOPPED':
                await message.edit({
                  content: `⏹️ **Stopped:** ~~${EventUtils.formatTrackInfo(track)}~~`,
                  files: []
                });

                setTimeout(async () => {
                  try {
                    await message.delete().catch(() => {});
                  } catch (deleteError) {
                    logger.debug('TrackEnd', 'Could not delete stopped message:', deleteError);
                  }
                }, 8000);
                break;

              case 'CLEANUP':
                await message.delete().catch(() => {});
                break;

              default:
                await message.delete().catch(() => {});
                break;
            }
          }
        } catch (messageError) {
          logger.debug('TrackEnd', 'Error handling now playing message cleanup:', messageError);
        }
      }

      if (stuckWarningId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const warningMessage = await channel?.messages.fetch(stuckWarningId).catch(() => null);
          if (warningMessage) {
            await warningMessage.delete().catch(() => {});
          }
        } catch (cleanupError) {
          logger.debug('TrackEnd', 'Error cleaning up stuck warning message:', cleanupError);
        }
      }

      if (errorMessageId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const errorMessage = await channel?.messages.fetch(errorMessageId).catch(() => null);
          if (errorMessage) {
            await errorMessage.delete().catch(() => {});
          }
        } catch (cleanupError) {
          logger.debug('TrackEnd', 'Error cleaning up error message:', cleanupError);
        }
      }

      player.set('nowPlayingMessageId', null);
      player.set('nowPlayingChannelId', null);
      player.set('stuckWarningMessageId', null);
      player.set('errorMessageId', null);
      player.set('stuckTimeoutId', null);

      if (endReason === 'FINISHED' && track?.info) {
        logger.info('TrackEnd', `Track completed: "${track.info.title}" by ${track.info.author} in guild ${player.guildId}`);
      }

    } catch (error) {
      logger.error('TrackEnd', 'Error in trackEnd event:', error);
    }
  }
};