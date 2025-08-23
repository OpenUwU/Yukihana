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

class SupportCommand extends Command {
	constructor() {
		super({
			name: "support",
			description: "Get support and help with the bot.",
			usage: "support",
			aliases: ["help-server", "discord", "server"],
			category: "info",
			examples: ["support", "help-server"],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: "support",
				description: "Get support and help with the bot.",
			},
		});
	}

	async execute({ message }) {
		try {
			await message.reply({
				components: [this._createSupportContainer()],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("SupportCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while loading support information.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ interaction }) {
		try {
			await interaction.reply({
				components: [this._createSupportContainer()],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("SupportCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while loading support information.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createSupportContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Support & Help**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**Need help with Yukihana?**\n\n` +
			`**${emoji.get('check')} Get Support For:**\n` +
			`├─ Music playback issues\n` +
			`├─ Command usage and setup\n` +
			`├─ Bot permissions and configuration\n` +
			`├─ Feature requests and suggestions\n` +
			`├─ Bug reports and technical issues\n` +
			`└─ Premium features and subscriptions\n\n` +
			`**${emoji.get('folder')} Support Resources:**\n` +
			`├─ Active community helpers\n` +
			`├─ Comprehensive documentation\n` +
			`├─ Frequently asked questions\n` +
			`└─ Direct developer assistance\n\n` +
			`**${emoji.get('add')} How to Get Help:**\n` +
			`├─ Join our support server\n` +
			`├─ Create a support ticket\n` +
			`├─ Browse existing solutions\n` +
			`└─ Ask in community channels\n\n` +
			`*Join our support server for fast assistance!*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setLabel('Support Server')
				.setStyle(ButtonStyle.Link)
				.setURL(config.links?.supportServer || "https://google.com")
				.setEmoji(emoji.get("add"))
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
}

export default new SupportCommand();
