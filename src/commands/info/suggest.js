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

class SuggestCommand extends Command {
	constructor() {
		super({
			name: "suggest",
			description: "Suggest new features or improvements for the bot.",
			usage: "suggest <your suggestion>",
			aliases: ["suggestion", "feature", "request"],
			category: "info",
			examples: ["suggest Add spotify playlist import", "suggestion Volume boost feature"],
			cooldown: 30,
			enabledSlash: true,
			slashData: {
				name: "suggest",
				description: "Suggest new features or improvements for the bot.",
				options: [
					{
						name: "suggestion",
						type: 3,
						description: "Your feature suggestion or improvement idea",
						required: true,
					},
				],
			},
		});
	}

	async execute({ client, message, args }) {
		try {
			if (!args.length) {
				return await message.reply({
					components: [this._createUsageContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			}

			const suggestionText = args.join(' ');
			const success = await this._sendSuggestion(client, message.author, suggestionText, message.guild);

			if (success) {
				await message.reply({
					components: [this._createSuccessContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			} else {
				await message.reply({
					components: [this._createErrorContainer("Failed to send suggestion. Please try again later.")],
					flags: MessageFlags.IsComponentsV2,
				});
			}
		} catch (error) {
			logger.error("SuggestCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while sending suggestion.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }) {
		try {
			const suggestionText = interaction.options.getString('suggestion');
			const success = await this._sendSuggestion(client, interaction.user, suggestionText, interaction.guild);

			if (success) {
				await interaction.reply({
					components: [this._createSuccessContainer()],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			} else {
				await interaction.reply({
					components: [this._createErrorContainer("Failed to send suggestion. Please try again later.")],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			}
		} catch (error) {
			logger.error("SuggestCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while sending suggestion.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	async _sendSuggestion(client, user, suggestion, guild) {
		try {
			const developer = await client.users.fetch('931059762173464597').catch(() => null);
			if (!developer) return false;

			const suggestionContent = `**${emoji.get('add')} New Suggestion Received**\n\n` +
				`**${emoji.get('info')} User:** ${user.tag} (${user.id})\n` +
				`**${emoji.get('folder')} Server:** ${guild ? `${guild.name} (${guild.id})` : 'Direct Message'}\n` +
				`**${emoji.get('add')} Suggestion:**\n${suggestion}\n\n` +
				`**${emoji.get('check')} Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
				`**${emoji.get('reset')} Type:** Feature Suggestion`;

			await developer.send(suggestionContent);
			return true;
		} catch (error) {
			logger.error("SuggestCommand", `Error sending suggestion: ${error.message}`, error);
			return false;
		}
	}

	_createSuccessContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('check')} **Suggestion Sent**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**Thank you for your suggestion!**\n\n` +
			`Your feature suggestion has been successfully sent to our development team. We love hearing ideas from our community!\n\n` +
			`**${emoji.get('info')} What happens next:**\n` +
			`├─ Our team will review your suggestion\n` +
			`├─ We'll evaluate feasibility and impact\n` +
			`├─ Popular suggestions get priority consideration\n` +
			`└─ Approved features are added to our roadmap\n\n` +
			`**${emoji.get('add')} Implementation:** Good suggestions are typically considered for the next major update cycle.\n\n` +
			`**${emoji.get('folder')} Stay Updated:** Join our support server to track suggestion status and upcoming features!\n\n` +
			`*Thank you for helping shape Yukihana's future!*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		return container;
	}

	_createUsageContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Suggestion Usage**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**How to suggest features:**\n\n` +
			`**${emoji.get('check')} Usage:** \`suggest <your suggestion>\`\n` +
			`**${emoji.get('folder')} Examples:**\n` +
			`├─ \`suggest Add spotify playlist import\`\n` +
			`├─ \`suggest Volume boost feature for quiet songs\`\n` +
			`└─ \`suggest Custom sound effects and audio filters\`\n\n` +
			`**${emoji.get('add')} Good Suggestions Include:**\n` +
			`├─ Clear description of the feature\n` +
			`├─ How it would improve user experience\n` +
			`├─ Specific use cases or examples\n` +
			`└─ Why it would benefit the community\n\n` +
			`**${emoji.get('reset')} Popular Suggestion Categories:**\n` +
			`├─ Music playback enhancements\n` +
			`├─ Queue management features\n` +
			`├─ Audio effects and filters\n` +
			`├─ Playlist and favorites systems\n` +
			`├─ User interface improvements\n` +
			`└─ Integration with music platforms\n\n` +
			`*Help us build the features you want to see!*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

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

export default new SuggestCommand();
