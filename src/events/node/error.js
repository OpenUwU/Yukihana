import { logger } from '#utils/logger';

export default {
	name: "error",
	once: false,
	async execute(node, error, payload, musicManager, client) {
		try {
			logger.error('LavalinkNode', `❌ Lavalink Node #${node.id} errored:`, error);
			logger.error('LavalinkNode', `📦 Error Payload: ${JSON.stringify(payload)}`);
		} catch (error_) {
			logger.error('LavalinkNode', 'Error in node error event handler:', error_);
		}
	}
};