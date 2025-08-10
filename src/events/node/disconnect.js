import { logger } from '#utils/logger';

export default {
	name: "disconnect",
	once: false,
	async execute(node, reason, payload, musicManager, client) {
		try {
			logger.warn('LavalinkNode', `🔌 Lavalink Node #${node.id} disconnected. Reason: ${reason}`);
		} catch (error) {
			logger.error('LavalinkNode', 'Error in node disconnect event handler:', error);
		}
	}
};