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
import { logger } from "#utils/logger";

class BotInfoCommand extends Command {
	constructor() {
		super({
			name: "botinfo",
			description: "Shows detailed information about the bot.",
			usage: "botinfo",
			aliases: ["bot", "info", "about", "stats"],
			category: "info",
			examples: ["botinfo", "bot"],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: "botinfo",
				description: "Get detailed information about the bot.",
			},
		});
	}

	async execute({ client, message }) {
		try {
			const messageInstance = await message.reply({
				components: [this._createBotInfoContainer(client)],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(messageInstance, message.author.id, client);
		} catch (error) {
			logger.error("BotInfoCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while loading bot information.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }) {
		try {
			const messageInstance = await interaction.reply({
				components: [this._createBotInfoContainer(client)],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});

			this._setupCollector(messageInstance, interaction.user.id, client);
		} catch (error) {
			logger.error("BotInfoCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while loading bot information.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createBotInfoContainer(client) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Bot Information**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const uptime = this._formatUptime(client.uptime);
		const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

		const content = `**General Information**\n\n` +
			`**${emoji.get('check')} Bot Name:** Yukihana\n` +
			`**${emoji.get('folder')} Version:** 2.0.0\n` +
			`**${emoji.get('add')} Type:** Music & Utility Bot\n` +
			`**${emoji.get('reset')} Library:** Discord.js\n\n` +
			`**Statistics**\n` +
			`├─ **Uptime:** ${uptime}\n` +
			`├─ **Guilds:** ${client.guilds.cache.size}\n` +
			`├─ **Users:** ${client.users.cache.size}\n` +
			`├─ **Channels:** ${client.channels.cache.size}\n` +
			`├─ **Commands:** ${client.commands?.size || 0}\n` +
			`└─ **Memory Usage:** ${memoryUsage} MB\n\n` +
			`*High-quality music bot with advanced features*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('botinfo_team')
				.setLabel('Team Info')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("folder")),
			new ButtonBuilder()
				.setLabel('GitHub')
				.setStyle(ButtonStyle.Link)
				.setURL('https://github.com/bre4d777/yukihana')
		);

		container.addActionRowComponents(buttonRow);

		return container;
	}

	_createTeamInfoContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('folder')} **Development Team**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**Meet our development team!**\n\n` +
			`**${emoji.get('check')} Lead Developer:** Bre4d777\n` +
			`**${emoji.get('folder')} Bot Name:** Yukihana\n` +
			`**${emoji.get('add')} Specialization:** Music & Utility Bot\n` +
			`**${emoji.get('reset')} Status:** Active Development\n\n` +
			`*We're constantly working to improve your experience!*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('botinfo_back')
				.setLabel('Bot Info')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("info")),
			new ButtonBuilder()
				.setLabel('GitHub')
				.setStyle(ButtonStyle.Link)
				.setURL('https://github.com/bre4d777/yukihana')
		);

		container.addActionRowComponents(buttonRow);

		return container;
	}

	_createErrorContainer(message) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('cross')} **Error**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
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
			time: 300_000
		});

		collector.on('collect', async (interaction) => {
			try {
				if (interaction.customId === 'botinfo_team') {
					await interaction.update({
						components: [this._createTeamInfoContainer()],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === 'botinfo_back') {
					await interaction.update({
						components: [this._createBotInfoContainer(client)],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			} catch (error) {
				logger.error("BotInfoCommand", `Error in collector: ${error.message}`, error);
			}
		});

		collector.on('end', async () => {
			try {
				const fetchedMessage = await message.fetch().catch(() => null);
				if (fetchedMessage?.components.length > 0) {
					await fetchedMessage.edit({
						components: [this._createExpiredContainer()]
					});
				}
			} catch (error) {
				if (error.code !== 10008) {
					logger.error("BotInfoCommand", `Error updating expired components: ${error.message}`, error);
				}
			}
		});
	}

	_createExpiredContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Bot Information**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**This interaction has expired**\n\n` +
			`Run the command again to view bot information \n\n` +
			`*Commands: \`botinfo\`, \`bot\`, \`info\`, \`about\`, \`stats\`*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		return container;
	}
}

export default new BotInfoCommand();
