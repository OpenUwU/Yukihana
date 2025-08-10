import { logger } from '#utils/logger';

export default class PlayerMove {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
  }

  async execute(player, oldChannelId, newChannelId) {
    logger.info('LavalinkPlayer', `🚚 Player moved: ${oldChannelId} → ${newChannelId}`);
  }
}
