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

class PrivacyPolicyCommand extends Command {
	constructor() {
		super({
			name: "privacy-policy",
			description: "View the bot's Privacy Policy and data handling practices.",
			usage: "pp",
			aliases: ["privacy", "privacypolicy", "data", "pp"],
			category: "info",
			examples: ["pp", "privacy"],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: "pp",
				description: "View the bot's Privacy Policy and data handling practices.",
			},
		});
	}

	async execute({ message }) {
		try {
			await message.reply({
				components: [this._createPrivacyContainer()],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("PrivacyPolicyCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while loading Privacy Policy.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ interaction }) {
		try {
			await interaction.reply({
				components: [this._createPrivacyContainer()],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("PrivacyPolicyCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while loading Privacy Policy.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createPrivacyContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Privacy Policy**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**We value your privacy and handle data responsibly**\n\n` +
			`**${emoji.get('folder')} Data We Collect**\n` +
			`├─ Discord User ID for identification and functionality\n` +
			`├─ Guild ID for server-specific settings\n` +
			`├─ Music listening history for recommendations\n` +
			`├─ Custom prefixes and bot preferences\n` +
			`└─ Premium status and subscription information\n\n` +
			`**${emoji.get('check')} How We Use Data**\n` +
			`├─ Providing core bot functionality and music services\n` +
			`├─ Maintaining user preferences and settings\n` +
			`├─ Anti-abuse protection and cooldown management\n` +
			`├─ Premium feature access and subscriptions\n` +
			`└─ Improving service quality and experience\n\n` +
			`**${emoji.get('add')} Data Storage & Security**\n` +
			`├─ Stored securely in encrypted databases\n` +
			`├─ Industry-standard security measures implemented\n` +
			`├─ Regular backups ensure data integrity\n` +
			`└─ Access restricted to authorized team members\n\n` +
			`**${emoji.get('cross')} Data Sharing**\n` +
			`├─ We do not sell personal data to third parties\n` +
			`├─ Music metadata sourced from public APIs\n` +
			`├─ Anonymous usage statistics for improvements\n` +
			`└─ Legal compliance may require disclosure\n\n` +
			`**${emoji.get('reset')} Your Rights**\n` +
			`├─ Request data deletion through support\n` +
			`├─ View stored data through bot commands\n` +
			`├─ Opt-out by discontinuing bot usage\n` +
			`└─ Update or correct information anytime\n\n` +
			`*Effective: August 2025 | Last updated: August 2025*`;

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

export default new PrivacyPolicyCommand();