import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";

export default {
	name: "playerMove",
	once: false,
	async execute(player, oldChannelId, newChannelId) {
		logger.info(
			"LavalinkPlayerMoved",
			`🚚 Player moved: ${oldChannelId} → ${newChannelId}`,
		);
	},
};
