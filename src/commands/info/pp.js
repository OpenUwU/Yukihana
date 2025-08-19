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
			aliases: ["privacy", "privacypolicy", "data","pp"],
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
			new TextDisplayBuilder().setContent(`### ${emoji.get('info')} Privacy Policy`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const thumbnailUrl = config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png';

		const content = `**We value your privacy and handle data responsibly:**\n\n` +
			`**1. Data We Collect**\n` +
			`├─ Discord User ID for identification and bot functionality\n` +
			`├─ Guild ID for server-specific settings and configurations\n` +
			`├─ Music listening history for personalized recommendations\n` +
			`├─ Custom prefixes and bot preferences you configure\n` +
			`└─ Premium status and subscription information\n\n` +
			`**2. How We Use Data**\n` +
			`├─ Providing core bot functionality and music services\n` +
			`├─ Maintaining user preferences and custom settings\n` +
			`├─ Anti-abuse protection and cooldown management\n` +
			`├─ Premium feature access and subscription management\n` +
			`└─ Improving service quality and user experience\n\n` +
			`**3. Data Storage & Security**\n` +
			`├─ Data is stored securely in encrypted databases\n` +
			`├─ We implement industry-standard security measures\n` +
			`├─ Regular backups ensure data integrity and availability\n` +
			`└─ Access is restricted to authorized development team members\n\n` +
			`**4. Data Sharing**\n` +
			`├─ We do not sell or share personal data with third parties\n` +
			`├─ Music metadata may be sourced from public APIs\n` +
			`├─ Anonymous usage statistics may be collected for improvements\n` +
			`└─ Legal compliance may require data disclosure when required\n\n` +
			`**5. Your Rights**\n` +
			`├─ Request data deletion by contacting our support team\n` +
			`├─ View your stored data through bot commands\n` +
			`├─ Opt-out of data collection by discontinuing bot usage\n` +
			`└─ Update or correct your information at any time\n\n` +
			`*Last updated: August 2025*`;

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