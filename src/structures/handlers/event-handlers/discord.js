import { logger } from '#utils/logger';

export default class DiscordHandler {
	constructor(client) {
		this.client = client;
		this.registeredEvents = new Map();
	}

	async register(event) {
		try {
			const listener = (...args) => {
				try {
					event.execute(...args, this.client);
				} catch (error) {
					logger.error(
						'DiscordEvent',
						`Error in Discord event ${event.name}:`,
						error,
					);
				}
			};

			if (event.once) {
				this.client.once(event.name, listener);
			} else {
				this.client.on(event.name, listener);
			}

			this.registeredEvents.set(event.name, listener);
			return true;
		} catch (error) {
			logger.error(
				'DiscordEvent',
				`Failed to register Discord event: ${event.name}`,
				error,
			);
			return false;
		}
	}

	async unregister(eventName) {
		if (this.registeredEvents.has(eventName)) {
			this.client.removeListener(
				eventName,
				this.registeredEvents.get(eventName),
			);
			this.registeredEvents.delete(eventName);
		}
	}

	async unregisterAll() {
		for (const [eventName, listener] of this.registeredEvents) {
			this.client.removeListener(eventName, listener);
		}
		this.registeredEvents.clear();
	}
}
