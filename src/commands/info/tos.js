import { Command } from "#structures/classes/Command";
import {
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

class TermsOfServiceCommand extends Command {
	constructor() {
		super({
			name: "tos",
			description: "View the bot's Terms of Service and usage guidelines.",
			usage: "tos",
			aliases: ["terms", "termsofservice", "rules"],
			category: "info",
			examples: ["tos", "terms"],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: "tos",
				description: "View the bot's Terms of Service and usage guidelines.",
			},
		});
	}

	async execute({ message }) {
		try {
			await message.reply({
				components: [this._createTermsContainer()],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("TermsOfServiceCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while loading Terms of Service.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ interaction }) {
		try {
			await interaction.reply({
				components: [this._createTermsContainer()],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("TermsOfServiceCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while loading Terms of Service.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createTermsContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Terms of Service**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**By using Yukihana, you agree to these terms**\n\n` +
			`**${emoji.get('check')} Acceptable Use**\n` +
			`├─ Use the bot responsibly and follow Discord's ToS\n` +
			`├─ Respect all cooldowns and rate limits for fair usage\n` +
			`├─ Do not attempt to exploit or abuse bot systems\n` +
			`└─ Maintain appropriate conduct in all interactions\n\n` +
			`**${emoji.get('folder')} Service Provision**\n` +
			`├─ Service is provided "as-is" without uptime guarantees\n` +
			`├─ Features may be modified or discontinued with notice\n` +
			`├─ Premium features are subject to additional terms\n` +
			`└─ We reserve the right to limit or suspend access\n\n` +
			`**${emoji.get('cross')} Prohibited Activities**\n` +
			`├─ Using the bot for illegal activities or copyright infringement\n` +
			`├─ Attempting to bypass anti-abuse or security systems\n` +
			`├─ Distributing malicious content or spam through the bot\n` +
			`└─ Disrupting service availability for other users\n\n` +
			`**${emoji.get('reset')} Data & Privacy**\n` +
			`├─ We collect minimal data necessary for functionality\n` +
			`├─ User data is stored securely and not shared inappropriately\n` +
			`├─ You may request data deletion at any time\n` +
			`└─ See our Privacy Policy for complete data handling details\n\n` +
			`**${emoji.get('add')} Enforcement**\n` +
			`├─ Violations may result in cooldown penalties or blacklisting\n` +
			`├─ Automated systems monitor for abuse patterns\n` +
			`├─ Appeals may be submitted through official channels\n` +
			`└─ Decisions are made at the discretion of the development team\n\n` +
			`*Effective: August 2025 | By using this bot, you acknowledge and accept these terms*`;

		const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

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

		const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		return container;
	}
}

export default new TermsOfServiceCommand();