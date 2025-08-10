import { logger } from '#utils/logger';

export default class Error {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
  }

  async execute(node, error, payload) {
    try {
      logger.error('LavalinkNode', `❌ Lavalink Node #${node.id} errored:`, error);
      logger.error('LavalinkNode', `📦 Error Payload: ${JSON.stringify(payload)}`);
    } catch (error_) {
      logger.error('LavalinkNode', 'Error in node error event handler:', error_);
    }
  }
}
