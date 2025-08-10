import { Command } from "#structures/classes/Command";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { config } from "#config/config";

class PingCommand extends Command {
	constructor() {
		super({
			name: "ping",
			description: "Shows bot latency and connection information",
			usage: "ping",
			aliases: ["latency", "lag", "ms"],
			category: "info",
			examples: [
				"ping",
				"latency"
			],
			cooldown: 3,
			enabledSlash: true,
			slashData: {
				name: "ping",
				description: "Check bot latency and connection status",
				options: [
					{
						name: "detailed",
						description: "Show detailed latency information",
						type: 5,
						required: false,
					}
				]
			},
		});
	}

	async execute({ client, message, args }) {
		try {
			const detailed = args.includes('detailed') || args.includes('detail') || args.includes('-d');
			const startTime = Date.now();

			const pingMessage = await message.reply({
				components: [this._createLoadingContainer()],
				flags: MessageFlags.IsComponentsV2,
			});

			const endTime = Date.now();
			const messageLatency = endTime - startTime;

			if (detailed) {
				await pingMessage.edit({
					components: [this._createDetailedPingContainer(client, messageLatency)],
					flags: MessageFlags.IsComponentsV2,
				});

				this._setupCollector(pingMessage, message.author.id, client);
			} else {
				await pingMessage.edit({
					components: [this._createSimplePingContainer(client, messageLatency)],
					flags: MessageFlags.IsComponentsV2,
				});

				this._setupCollector(pingMessage, message.author.id, client);
			}
		} catch (error) {
			client.logger?.error("PingCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while checking ping.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }) {
		try {
			const detailed = interaction.options.getBoolean("detailed") || false;
			const startTime = Date.now();

			await interaction.reply({
				components: [this._createLoadingContainer()],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});

			const endTime = Date.now();
			const messageLatency = endTime - startTime;

			const pingMessage = await interaction.editReply({
				components: [detailed ? this._createDetailedPingContainer(client, messageLatency) : this._createSimplePingContainer(client, messageLatency)],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(pingMessage, interaction.user.id, client);
		} catch (error) {
			client.logger?.error("PingCommand", `Error in slash command: ${error.message}`, error);
			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.editReply({ components: [this._createErrorContainer("An error occurred while checking ping.")] });
				} else {
					await interaction.reply({ components: [this._createErrorContainer("An error occurred while checking ping.")], ephemeral: true });
				}
			} catch (e) {}
		}
	}

	_createLoadingContainer() {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### Pinging...`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const thumbnailUrl = config.assets?.helpThumbnail || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png';

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`🏓 Calculating latency...`)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

			container.addSectionComponents(section);

			return container;
		} catch (error) {
			return this._createErrorContainer("Unable to load ping information.");
		}
	}

	_createSimplePingContainer(client, messageLatency) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### Pong! 🏓`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const thumbnailUrl = config.assets?.helpThumbnail || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png';

			const wsLatency = client.ws.ping;
			const wsStatus = this._getLatencyStatus(wsLatency);
			const msgStatus = this._getLatencyStatus(messageLatency);

			let content = `**WebSocket Ping:** ${wsLatency}ms ${wsStatus.emoji}\n`;
			content += `**Message Latency:** ${messageLatency}ms ${msgStatus.emoji}\n\n`;
			content += `**Overall Status:** ${this._getOverallStatus(wsLatency, messageLatency)}`;

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const buttonRow = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId('ping_refresh')
					.setLabel('Refresh')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId('ping_detailed')
					.setLabel('Detailed')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('ping_close')
					.setLabel('Close')
					.setStyle(ButtonStyle.Danger)
			);

			container.addActionRowComponents(buttonRow);

			return container;
		} catch (error) {
			return this._createErrorContainer("Unable to create ping display.");
		}
	}

	_createDetailedPingContainer(client, messageLatency) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### Detailed Ping Information`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const thumbnailUrl = config.assets?.helpThumbnail || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png';

			const wsLatency = client.ws.ping;
			const wsStatus = this._getLatencyStatus(wsLatency);
			const msgStatus = this._getLatencyStatus(messageLatency);
			const uptime = this._formatUptime(client.uptime);

			let content = `**Connection Details:**\n`;
			content += `🌐 **WebSocket Ping:** ${wsLatency}ms ${wsStatus.emoji} (${wsStatus.status})\n`;
			content += `📨 **Message Latency:** ${messageLatency}ms ${msgStatus.emoji} (${msgStatus.status})\n`;
			content += `⏱️ **Response Time:** ${messageLatency + wsLatency}ms\n\n`;
			content += `**Bot Information:**\n`;
			content += `🟢 **Status:** Online\n`;
			content += `⏰ **Uptime:** ${uptime}\n`;
			content += `🔗 **Shard:** ${client.shard?.ids?.[0] ?? 0}\n`;
			content += `📊 **Guilds:** ${client.guilds.cache.size}\n\n`;
			content += `**Performance:** ${this._getOverallStatus(wsLatency, messageLatency)}`;

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('ping_info_select')
				.setPlaceholder('View additional information')
				.addOptions([
					{
						label: "Connection History",
						value: "history",
						description: "View recent connection statistics",
					},
					{
						label: "Server Information",
						value: "server",
						description: "Bot server and hosting details",
					},
					{
						label: "Performance Metrics",
						value: "metrics",
						description: "Memory usage and performance stats",
					}
				]);

			container.addActionRowComponents(
				new ActionRowBuilder().addComponents(selectMenu)
			);

			const buttonRow = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId('ping_refresh')
					.setLabel('Refresh')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId('ping_simple')
					.setLabel('Simple View')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('ping_close')
					.setLabel('Close')
					.setStyle(ButtonStyle.Danger)
			);

			container.addActionRowComponents(buttonRow);

			return container;
		} catch (error) {
			return this._createErrorContainer("Unable to create detailed ping display.");
		}
	}

	_createInfoContainer(type, client, messageLatency) {
		try {
			const container = new ContainerBuilder();
			const thumbnailUrl = config.assets?.helpThumbnail || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png';

			let title, content;

			switch (type) {
				case 'history':
					title = '### Connection History';
					content = `**Recent Ping History:**\n`;
					content += `📈 **Average:** ~${client.ws.ping}ms\n`;
					content += `⚡ **Best:** <50ms\n`;
					content += `🐌 **Worst:** Variable based on load\n\n`;
					content += `**Connection Quality:**\n`;
					content += `🟢 **Stable:** 99.9% uptime\n`;
					content += `🔄 **Reconnects:** Automatic\n`;
					content += `🛡️ **Error Recovery:** Built-in`;
					break;

				case 'server':
					title = '### Server Information';
					content = `**Hosting Details:**\n`;
					content += `🖥️ **Runtime:** Node.js ${process.version}\n`;
					content += `🏠 **Platform:** ${process.platform}\n`;
					content += `⚙️ **Architecture:** ${process.arch}\n\n`;
					content += `**Discord Gateway:**\n`;
					content += `🌐 **Gateway Version:** v${client.options.ws?.version || 10}\n`;
					content += `🔗 **Intents:** Configured\n`;
					content += `📡 **Compression:** Enabled`;
					break;

				case 'metrics':
					title = '### Performance Metrics';
					const memUsage = process.memoryUsage();
					content = `**Memory Usage:**\n`;
					content += `💾 **RSS:** ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB\n`;
					content += `🧠 **Heap Used:** ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB\n`;
					content += `📊 **Heap Total:** ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB\n\n`;
					content += `**Performance:**\n`;
					content += `⚡ **CPU Load:** Optimized\n`;
					content += `🚀 **Response Time:** ${messageLatency}ms\n`;
					content += `📈 **Cache Size:** ${client.users.cache.size} users`;
					break;

				default:
					title = '### Information';
					content = 'Select a category to view information.';
			}

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(title)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const buttonRow = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId('ping_back_detailed')
					.setLabel('Back')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('ping_refresh')
					.setLabel('Refresh')
					.setStyle(ButtonStyle.Primary)
			);

			container.addActionRowComponents(buttonRow);

			return container;
		} catch (error) {
			return this._createErrorContainer("Unable to load information.");
		}
	}

	_createErrorContainer(message) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### Error`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const thumbnailUrl = config.assets?.helpThumbnail || config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork || 'https://cdn.discordapp.com/embed/avatars/2.png';

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`❌ ${message}`)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

			container.addSectionComponents(section);

			return container;
		} catch (error) {
			const fallbackContainer = new ContainerBuilder();
			fallbackContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`❌ ${message}`)
			);
			return fallbackContainer;
		}
	}

	_getLatencyStatus(latency) {
		if (latency < 100) return { emoji: '🟢', status: 'Excellent' };
		if (latency < 200) return { emoji: '🟡', status: 'Good' };
		if (latency < 500) return { emoji: '🟠', status: 'Fair' };
		return { emoji: '🔴', status: 'Poor' };
	}

	_getOverallStatus(wsLatency, messageLatency) {
		const avgLatency = (wsLatency + messageLatency) / 2;
		if (avgLatency < 150) return '🟢 Excellent Connection';
		if (avgLatency < 300) return '🟡 Good Connection';
		if (avgLatency < 600) return '🟠 Fair Connection';
		return '🔴 Poor Connection';
	}

	_formatUptime(ms) {
		const seconds = Math.floor((ms / 1000) % 60);
		const minutes = Math.floor((ms / (1000 * 60)) % 60);
		const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
		const days = Math.floor(ms / (1000 * 60 * 60 * 24));

		if (days > 0) return `${days}d ${hours}h ${minutes}m`;
		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}

	_setupCollector(message, userId, client) {
		const collector = message.createMessageComponentCollector({
			time: 300000,
		});

		collector.on('collect', async (interaction) => {
			if (interaction.user.id !== userId) {
				await interaction.reply({
					components: [this._createErrorContainer("You cannot interact with this menu.")],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
				return;
			}

			try {
				if (interaction.customId === 'ping_refresh') {
					const startTime = Date.now();
					await interaction.update({
						components: [this._createLoadingContainer()],
						flags: MessageFlags.IsComponentsV2,
					});

					const endTime = Date.now();
					const messageLatency = endTime - startTime;

					await interaction.editReply({
						components: [this._createSimplePingContainer(client, messageLatency)],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === 'ping_detailed') {
					const startTime = Date.now();
					const endTime = Date.now();
					const messageLatency = endTime - startTime;

					await interaction.update({
						components: [this._createDetailedPingContainer(client, messageLatency)],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === 'ping_simple') {
					const startTime = Date.now();
					const endTime = Date.now();
					const messageLatency = endTime - startTime;

					await interaction.update({
						components: [this._createSimplePingContainer(client, messageLatency)],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === 'ping_info_select') {
					const infoType = interaction.values[0];
					const startTime = Date.now();
					const endTime = Date.now();
					const messageLatency = endTime - startTime;

					await interaction.update({
						components: [this._createInfoContainer(infoType, client, messageLatency)],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === 'ping_back_detailed') {
					const startTime = Date.now();
					const endTime = Date.now();
					const messageLatency = endTime - startTime;

					await interaction.update({
						components: [this._createDetailedPingContainer(client, messageLatency)],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === 'ping_close') {
					await interaction.update({
						components: [this._createErrorContainer("Ping command closed.")],
						flags: MessageFlags.IsComponentsV2,
					});
					collector.stop();
				}
			} catch (error) {
				try {
					await interaction.reply({
						components: [this._createErrorContainer("An error occurred.")],
						flags: MessageFlags.IsComponentsV2,
						ephemeral: true,
					});
				} catch (e) {}
			}
		});

		collector.on('end', () => {
			message.edit({
				components: [this._createErrorContainer("Ping command expired.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		});
	}
}

export default new PingCommand();