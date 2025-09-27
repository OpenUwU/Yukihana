import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";

export default {
	name: "playerCreate",
	once: false,
	async execute(player) {
		try {
			logger.info(
				"PlayerCreate",
				`🎵 Player created for guild: ${player.guildId}`,
			);
		} catch (error) {
			logger.error("PlayerCreate", "Error in playerCreate event:", error);
		}
	},
};
