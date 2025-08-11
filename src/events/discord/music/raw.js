export default {
	name: "raw",
	once: false,
	async execute(data, client) {
		try {
			this.lavalink.sendRawData(data);
		} catch (error) {
			logger.error("LavalinkClient", "Error in raw event handler:", error);
		}
	},
};
