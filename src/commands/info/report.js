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

class ReportCommand extends Command {
	constructor() {
		super({
			name: "report",
			description: "Report bugs or issues with the bot to the developers.",
			usage: "report <issue description>",
			aliases: ["bug", "issue"],
			category: "info",
			examples: ["report Music stops playing randomly", "bug Commands not responding in voice channel"],
			cooldown: 30,
			enabledSlash: true,
			slashData: {
				name: "report",
				description: "Report bugs or issues with the bot to the developers.",
				options: [
					{
						name: "issue",
						type: 3,
						description: "Describe the bug or issue you're experiencing",
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

			const issueDescription = args.join(' ');
			const success = await this._sendReport(client, message.author, issueDescription, message.guild);

			if (success) {
				await message.reply({
					components: [this._createSuccessContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			} else {
				await message.reply({
					components: [this._createErrorContainer("Failed to send report. Please try again later.")],
					flags: MessageFlags.IsComponentsV2,
				});
			}
		} catch (error) {
			logger.error("ReportCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while sending report.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }) {
		try {
			const issueDescription = interaction.options.getString('issue');
			const success = await this._sendReport(client, interaction.user, issueDescription, interaction.guild);

			if (success) {
				await interaction.reply({
					components: [this._createSuccessContainer()],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			} else {
				await interaction.reply({
					components: [this._createErrorContainer("Failed to send report. Please try again later.")],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			}
		} catch (error) {
			logger.error("ReportCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while sending report.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	async _sendReport(client, user, issue, guild) {
		try {
			const developer = await client.users.fetch('931059762173464597').catch(() => null);
			if (!developer) return false;

			const reportContent = `**${emoji.get('cross')} Bug Report Received**\n\n` +
				`**${emoji.get('info')} User:** ${user.tag} (${user.id})\n` +
				`**${emoji.get('folder')} Server:** ${guild ? `${guild.name} (${guild.id})` : 'Direct Message'}\n` +
				`**${emoji.get('cross')} Issue:**\n${issue}\n\n` +
				`**${emoji.get('add')} Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
				`**${emoji.get('reset')} Priority:** High - Bug Report`;

			await developer.send(reportContent);
			return true;
		} catch (error) {
			logger.error("ReportCommand", `Error sending report: ${error.message}`, error);
			return false;
		}
	}

	_createSuccessContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('check')} **Report Sent**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**Thank you for reporting this issue!**\n\n` +
			`Your bug report has been successfully sent to our development team. We take all reports seriously and will investigate the issue as soon as possible.\n\n` +
			`**${emoji.get('info')} What happens next:**\n` +
			`├─ Our team will review the report\n` +
			`├─ We'll attempt to reproduce the issue\n` +
			`├─ A fix will be developed and tested\n` +
			`└─ The fix will be deployed in the next update\n\n` +
			`**${emoji.get('add')} Priority:** Bug reports receive high priority attention and are typically resolved within 24-48 hours.\n\n` +
			`*Thank you for helping us improve Yukihana's stability!*`;

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
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Report Usage**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**How to report bugs:**\n\n` +
			`**${emoji.get('check')} Usage:** \`report <issue description>\`\n` +
			`**${emoji.get('folder')} Examples:**\n` +
			`├─ \`report Music stops playing randomly\`\n` +
			`├─ \`report Commands not responding in voice channel\`\n` +
			`└─ \`report Bot disconnects from voice unexpectedly\`\n\n` +
			`**${emoji.get('add')} What to include:**\n` +
			`├─ Clear description of the problem\n` +
			`├─ Steps to reproduce the issue\n` +
			`├─ When the problem occurs\n` +
			`├─ Any error messages you see\n` +
			`└─ Expected vs actual behavior\n\n` +
			`**${emoji.get('cross')} Common Issues:**\n` +
			`├─ Audio playback problems\n` +
			`├─ Command response failures\n` +
			`├─ Voice channel connectivity\n` +
			`└─ Unexpected disconnections\n\n` +
			`*Help us fix bugs faster with detailed reports!*`;

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

export default new ReportCommand();
