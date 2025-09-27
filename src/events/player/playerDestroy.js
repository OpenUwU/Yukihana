import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";

export default {
	name: "playerDestroy",
	once: false,
	async execute(player,reason) {
		try {
			logger.info(
				"playerDestroy",
				`🎵 Player destroyed for guild: ${player.guildId},reason : ${reason}`,
			);
		} catch (error) {
			logger.error("PlayerDestroy", "Error in Pla event:", error);
		}
	},
};
