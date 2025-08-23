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
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";

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
			cooldown: 15,
			enabledSlash: true,
			slashData: {
				name: ["yuki","ping"],
				description: "Check bot latency and connection status",
			},
		});
	}

	async execute({ client, message, args }) {
		try {
			const startTime = Date.now();

			const pingMessage = await message.reply({
				components: [this._createLoadingContainer()],
				flags: MessageFlags.IsComponentsV2,
			});

			const endTime = Date.now();
			const messageLatency = endTime - startTime;

			await pingMessage.edit({
				components: [this._createPingContainer(client, messageLatency)],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(pingMessage, message.author.id, client);
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
			const startTime = Date.now();

			await interaction.reply({
				components: [this._createLoadingContainer()],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});

			const endTime = Date.now();
			const messageLatency = endTime - startTime;

			const pingMessage = await interaction.editReply({
				components: [this._createPingContainer(client, messageLatency)],
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
				new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Checking Latency`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`Calculating ping...`)
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork)
				);

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			return container;
		} catch (error) {
			return this._createErrorContainer("Unable to load ping information.");
		}
	}

	_createPingContainer(client, messageLatency) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${emoji.get("check")} Pong!`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const wsLatency = client.ws.ping;
			const uptime = this._formatUptime(client.uptime);

			let content = `**Latency Information:**\n`;
			content += `├─ **WebSocket Ping:** ${wsLatency}ms\n`;
			content += `├─ **Message Latency:** ${messageLatency}ms\n`;
			content += `└─ **Total Response:** ${wsLatency + messageLatency}ms\n\n`;
			content += `**Bot Statistics:**\n`;
			content += `├─ **Uptime:** ${uptime}\n`;
			content += `├─ **Guilds:** ${client.guilds.cache.size}\n`;
			content += `└─ **Users:** ${client.users.cache.size}`;

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content)
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork)
				);

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const buttonRow = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId('ping_refresh')
					.setLabel('Refresh')
					.setStyle(ButtonStyle.Secondary)
					.setEmoji(emoji.get("reset"))
			);

			container.addActionRowComponents(buttonRow);

			return container;
		} catch (error) {
			return this._createErrorContainer("Unable to create ping display.");
		}
	}

	_createErrorContainer(message) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} Error`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(message)
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork)
				);

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			return container;
		} catch (error) {
			const fallbackContainer = new ContainerBuilder();
			fallbackContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`${emoji.get("cross")} ${message}`)
			);
			return fallbackContainer;
		}
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
			filter: (i) => i.user.id === userId,
			time: 300_000
		});

		collector.on('collect', async (interaction) => {
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
						components: [this._createPingContainer(client, messageLatency)],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			} catch (error) {
				client.logger?.error("PingCommand", `Error in collector: ${error.message}`, error);
			}
		});

		collector.on('end', async () => {
			try {
				const fetchedMessage = await message.fetch().catch(() => null);
				if (fetchedMessage?.components.length > 0) {
					const disabledComponents = fetchedMessage.components.map((row) => {
						const newRow = ActionRowBuilder.from(row);
						newRow.components.forEach((component) => {
							if (component.data.style !== ButtonStyle.Link) {
								component.setDisabled(true);
							}
						});
						return newRow;
					});
					await fetchedMessage.edit({ components: disabledComponents });
				}
			} catch (error) {
				if (error.code !== 10008) {
					client.logger?.error("PingCommand", `Error disabling components: ${error.message}`, error);
				}
			}
		});
	}
}

export default new PingCommand();