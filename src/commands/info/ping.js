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
			examples: ["ping", "latency"],
			cooldown: 15,
			enabledSlash: true,
			slashData: {
				name: "ping",
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
			client.logger?.error(
				"PingCommand",
				`Error in prefix command: ${error.message}`,
				error,
			);
			await message
				.reply({
					components: [
						this._createErrorContainer(
							"An error occurred while checking ping.",
						),
					],
					flags: MessageFlags.IsComponentsV2,
				})
				.catch(() => {});
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
			client.logger?.error(
				"PingCommand",
				`Error in slash command: ${error.message}`,
				error,
			);
			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.editReply({
						components: [
							this._createErrorContainer(
								"An error occurred while checking ping.",
							),
						],
					});
				} else {
					await interaction.reply({
						components: [
							this._createErrorContainer(
								"An error occurred while checking ping.",
							),
						],
						ephemeral: true,
					});
				}
			} catch (e) {}
		}
	}

	_createLoadingContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Checking Latency**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content = `Calculating ping...`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
	}

	_createPingContainer(client, messageLatency) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get("check")} **Pong!**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const wsLatency = client.ws.ping;
		const uptime = this._formatUptime(client.uptime);

		const content =
			`**Latency Information:**\n` +
			`├─ **WebSocket Ping:** ${wsLatency}ms\n` +
			`├─ **Message Latency:** ${messageLatency}ms\n` +
			`└─ **Total Response:** ${wsLatency + messageLatency}ms\n\n` +
			`**Bot Statistics:**\n` +
			`├─ **Uptime:** ${uptime}\n` +
			`├─ **Guilds:** ${client.guilds.cache.size}\n` +
			`└─ **Users:** ${client.users.cache.size}`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId("ping_refresh")
				.setLabel("Refresh")
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("reset")),
		);

		container.addActionRowComponents(buttonRow);

		return container;
	}

	_createErrorContainer(message) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
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
			time: 300_000,
		});

		collector.on("collect", async (interaction) => {
			try {
				if (interaction.customId === "ping_refresh") {
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
				client.logger?.error(
					"PingCommand",
					`Error in collector: ${error.message}`,
					error,
				);
			}
		});

		collector.on("end", async () => {
			try {
				const fetchedMessage = await message.fetch().catch(() => null);
				if (fetchedMessage?.components.length > 0) {
					await fetchedMessage.edit({
						components: [this._createDisabledContainer(client)],
					});
				}
			} catch (error) {
				if (error.code !== 10008) {
					client.logger?.error(
						"PingCommand",
						`Error updating expired components: ${error.message}`,
						error,
					);
				}
			}
		});
	}

	_createDisabledContainer(client) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get("check")} **Pong!**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const wsLatency = client.ws.ping;
		const uptime = this._formatUptime(client.uptime);

		const content =
			`**Latency Information:**\n` +
			`├─ **WebSocket Ping:** ${wsLatency}ms\n` +
			`├─ **Message Latency:** Expired\n` +
			`└─ **Total Response:** ${wsLatency}ms\n\n` +
			`**Bot Statistics:**\n` +
			`├─ **Uptime:** ${uptime}\n` +
			`├─ **Guilds:** ${client.guilds.cache.size}\n` +
			`└─ **Users:** ${client.users.cache.size}\n\n` +
			`*This command has expired. Run the command again to refresh.*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
	}
}

export default new PingCommand();
