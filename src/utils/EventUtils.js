import { logger } from '#utils/logger';

export class EventUtils {
	static async sendPlayerMessage(client, player, messageData) {
		try {
			const channel = client.channels.cache.get(player.textChannelId);
			if (!channel) {
				logger.debug(
					'EventUtils',
					`Text channel ${player.textChannelId} not found for guild ${player.guildId}`,
				);
				return null;
			}
			return await channel.send(messageData);
		} catch (error) {
			logger.error('EventUtils', 'Failed to send player message:', error);
			return null;
		}
	}

	static async editMessage(client, channelId, messageId, editData) {
		try {
			const channel = client.channels.cache.get(channelId);
			if (!channel) return null;

			const message = await channel.messages
				.fetch(messageId)
				.catch(() => null);
			if (!message) return null;

			return await message.edit(editData);
		} catch (error) {
			logger.debug('EventUtils', 'Failed to edit message:', error);
			return null;
		}
	}

	static async deleteMessage(client, channelId, messageId) {
		try {
			const channel = client.channels.cache.get(channelId);
			if (!channel) return false;

			const message = await channel.messages
				.fetch(messageId)
				.catch(() => null);
			if (!message) return false;

			await message.delete();
			return true;
		} catch (error) {
			logger.debug('EventUtils', 'Failed to delete message:', error);
			return false;
		}
	}

	static clearPlayerTimeout(player, timeoutKey) {
		const timeoutId = player.get(timeoutKey);
		if (timeoutId) {
			clearTimeout(timeoutId);
			player.set(timeoutKey, null);
		}
	}

	static formatTrackInfo(track) {
		if (!track?.info) return 'Unknown Track';
		return `**${track.info.title || 'Unknown'}** by **${
			track.info.author || 'Unknown'
		}**`;
	}
}
