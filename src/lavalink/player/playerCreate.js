import { logger } from '#utils/logger';

export default class PlayerCreate {
  constructor(musicManager, client) {
    this.musicManager   =musicManager;
    this.client   =client;
    this.lavalink   =musicManager.lavalink;
  }

  async execute(player) {
    logger.info('LavalinkPlayer', `🎵 Player created for guild: ${player.guildId}`);
  }
}
