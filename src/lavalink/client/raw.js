import { logger } from '#utils/logger';

export default class Raw {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
  }

  async execute(data) {
    try {
      this.lavalink.sendRawData(data);
    } catch (error) {
      logger.error('LavalinkClient', 'Error in raw event handler:', error);
    }
  }
}
