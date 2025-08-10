import { logger } from '#utils/logger';

export default class Disconnect {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
  }

  async execute(node, reason) {
    try {
      logger.warn('LavalinkNode', `🔌 Lavalink Node #${node.id} disconnected. Reason: ${reason}`);
    } catch (error) {
      logger.error('LavalinkNode', 'Error in node disconnect event handler:', error);
    }
  }
}
