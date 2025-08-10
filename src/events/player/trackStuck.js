import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";

export default {
  name: "trackStuck",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      logger.warn('TrackStuck', `Track stuck for ${payload.thresholdMs}ms in guild ${player.guildId}:`, {
        track: track?.info?.title || 'Unknown',
        threshold: payload.thresholdMs,
        guildId: player.guildId
      });

      const messageId = player.get('nowPlayingMessageId');
      const channelId = player.get('nowPlayingChannelId');

      if (messageId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const message = await channel?.messages.fetch(messageId).catch(() => null);

          if (message) {
            await message.edit({
              content: `⚠️ **Track Stuck** - Attempting to recover...\n${EventUtils.formatTrackInfo(track)}`,
              files: []
            });
          }
        } catch (editError) {
          logger.warn('TrackStuck', 'Could not edit now playing message:', editError);
        }
      }

      const warningMessage = await EventUtils.sendPlayerMessage(client, player, {
        content: `⚠️ **Audio playback is experiencing issues.** Attempting to recover automatically...`
      });

      if (warningMessage?.id) {
        player.set('stuckWarningMessageId', warningMessage.id);
      }

      const stuckTimeoutId = setTimeout(async () => {
        try {
          if (player.queue.current && player.queue.current.info.identifier === track?.info?.identifier) {
            logger.info('TrackStuck', `Auto-skipping stuck track: ${track?.info?.title}`);

            const warningMsgId = player.get('stuckWarningMessageId');
            if (warningMsgId) {
              try {
                const channel = client.channels.cache.get(player.textChannelId);
                const warningMsg = await channel?.messages.fetch(warningMsgId).catch(() => null);
                if (warningMsg) {
                  await warningMsg.delete().catch(() => {});
                }
                player.set('stuckWarningMessageId', null);
              } catch (cleanupError) {
                logger.debug('TrackStuck', 'Failed to clean up warning message:', cleanupError);
              }
            }

            await player.skip();
          }
        } catch (skipError) {
          logger.error('TrackStuck', 'Failed to auto-skip stuck track:', skipError);
        }
      }, 10000);

      player.set('stuckTimeoutId', stuckTimeoutId);

    } catch (error) {
      logger.error('TrackStuck', 'Error in trackStuck event:', error);
    }
  }
};