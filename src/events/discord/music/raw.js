import { logger } from "#utils/logger"
import client from "../../../index.js"
export default {
	name: "raw",
	once: false,
	async execute(data) {
		try {
			client.lavalink.sendRawData(data);
		} catch (error) {
			logger.error("LavalinkClient", "Error in raw event handler:", error);
		}
	},
};
