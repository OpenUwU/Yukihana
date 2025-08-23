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

class InviteCommand extends Command {
	constructor() {
		super({
			name: "invite",
			description: "Get the bot's invite link to add it to your server.",
			usage: "invite",
			aliases: ["inv", "add", "addbot"],
			category: "info",
			examples: ["invite", "inv"],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: "invite",
				description: "Get the bot's invite link to add it to your server.",
			},
		});
	}

	async execute({ client, message }) {
		try {
			await message.reply({
				components: [this._createInviteContainer(client)],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("InviteCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while generating invite link.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }) {
		try {
			await interaction.reply({
				components: [this._createInviteContainer(client)],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("InviteCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while generating invite link.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createInviteContainer(client) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('add')} **Invite Yukihana**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

		const content = `**Add Yukihana to your server!**\n\n` +
			`**${emoji.get('check')} Features:**\n` +
			`├─ High-quality music streaming\n` +
			`├─ Advanced queue management\n` +
			`├─ Multiple audio sources support\n` +
			`└─ 24/7 music playback\n\n` +
			`**${emoji.get('info')} Required Permissions:**\n` +
			`├─ Connect to voice channels\n` +
			`├─ Speak in voice channels\n` +
			`├─ Send messages and embeds\n` +
			`├─ Use external emojis\n` +
			`└─ Manage messages for queue control\n\n` +
			`*Click the button below to add Yukihana to your server!*`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setLabel('Add to Server')
				.setStyle(ButtonStyle.Link)
				.setURL(inviteLink)
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

export default new InviteCommand();
