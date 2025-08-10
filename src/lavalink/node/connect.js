import { logger } from '#utils/logger';

export default class Connect {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
  }

  async execute(node) {
    try {
      logger.success('LavalinkNode', `✅ Lavalink Node #${node.id} connected successfully`);
      logger.info('LavalinkNode', `🌐 Node: ${node.options.host}:${node.options.port}`);
    } catch (error) {
      logger.error('LavalinkNode', 'Error in node connect event handler:', error);
    }
  }
}
