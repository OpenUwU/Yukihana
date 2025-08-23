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

class FeedbackCommand extends Command {
	constructor() {
		super({
			name: "feedback",
			description: "Send feedback about the bot to the developers.",
			usage: "feedback <your feedback>",
			aliases: ["fb"],
			category: "info",
			examples: ["feedback Great bot, love the music quality!", "fb The commands are very responsive"],
			cooldown: 30,
			enabledSlash: true,
			slashData: {
				name: "feedback",
				description: "Send feedback about the bot to the developers.",
				options: [
					{
						name: "message",
						type: 3,
						description: "Your feedback message",
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

			const feedbackMessage = args.join(' ');
			const success = await this._sendFeedback(client, message.author, feedbackMessage, message.guild);

			if (success) {
				await message.reply({
					components: [this._createSuccessContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			} else {
				await message.reply({
					components: [this._createErrorContainer("Failed to send feedback. Please try again later.")],
					flags: MessageFlags.IsComponentsV2,
				});
			}
		} catch (error) {
			logger.error("FeedbackCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while sending feedback.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }) {
		try {
			const feedbackMessage = interaction.options.getString('message');
			const success = await this._sendFeedback(client, interaction.user, feedbackMessage, interaction.guild);

			if (success) {
				await interaction.reply({
					components: [this._createSuccessContainer()],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			} else {
				await interaction.reply({
					components: [this._createErrorContainer("Failed to send feedback. Please try again later.")],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			}
		} catch (error) {
			logger.error("FeedbackCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while sending feedback.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	async _sendFeedback(client, user, message, guild) {
		try {
			const developer = await client.users.fetch('931059762173464597').catch(() => null);
			if (!developer) return false;

			const feedbackContent = `**New Feedback Received**\n\n` +
				`**${emoji.get('info')} User:** ${user.tag} (${user.id})\n` +
				`**${emoji.get('folder')} Server:** ${guild ? `${guild.name} (${guild.id})` : 'Direct Message'}\n` +
				`**${emoji.get('check')} Feedback:**\n${message}\n\n` +
				`**${emoji.get('add')} Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`;

			await developer.send(feedbackContent);
			return true;
		} catch (error) {
			logger.error("FeedbackCommand", `Error sending feedback: ${error.message}`, error);
			return false;
		}
	}

	_createSuccessContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('check')} **Feedback Sent**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**Thank you for your feedback!**\n\n` +
			`Your feedback has been successfully sent to our development team. We appreciate you taking the time to help us improve Yukihana!\n\n` +
			`**${emoji.get('info')} What happens next:**\n` +
			`├─ Our team will review your feedback\n` +
			`├─ We'll consider it for future updates\n` +
			`├─ Important issues get priority attention\n` +
			`└─ You may receive a follow-up if needed\n\n` +
			`*Thank you for helping us make Yukihana better!*`;

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
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Feedback Usage**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**How to send feedback:**\n\n` +
			`**${emoji.get('check')} Usage:** \`feedback <your message>\`\n` +
			`**${emoji.get('folder')} Examples:**\n` +
			`├─ \`feedback Great bot, love the music quality!\`\n` +
			`├─ \`feedback The commands are very responsive\`\n` +
			`└─ \`feedback Could use more audio filters\`\n\n` +
			`**${emoji.get('add')} What to include:**\n` +
			`├─ Your experience with the bot\n` +
			`├─ Features you love or dislike\n` +
			`├─ Performance observations\n` +
			`└─ General suggestions for improvement\n\n` +
			`*Your feedback helps us make Yukihana better for everyone!*`;

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

export default new FeedbackCommand();
