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
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";

class UnlinkSpotifyCommand extends Command {
	constructor() {
		super({
			name: "unlink-spotify",
			description: "Unlink your Spotify profile from the bot",
			usage: "unlink-spotify",
			aliases: ["spotify-unlink", "disconnect-spotify"],
			category: "music",
			examples: ["unlink-spotify", "spotify-unlink"],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: ["spotify","unlink"],
				description: "Unlink your Spotify profile from the bot",
			},
		});
	}

	async execute({ message }) {
		try {
			const spotifyProfile = db.user.getSpotifyProfile(message.author.id);
			
			if (!spotifyProfile) {
				return message.reply({
					components: [this._createNotLinkedContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			}

			const messageInstance = await message.reply({
				components: [this._createConfirmContainer(spotifyProfile)],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(messageInstance, message.author.id, spotifyProfile);
		} catch (error) {
			logger.error("UnlinkSpotifyCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer("An error occurred while processing your request.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ interaction }) {
		try {
			const spotifyProfile = db.user.getSpotifyProfile(interaction.user.id);
			
			if (!spotifyProfile) {
				return interaction.reply({
					components: [this._createNotLinkedContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			}

			const messageInstance = await interaction.reply({
				components: [this._createConfirmContainer(spotifyProfile)],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});

			this._setupCollector(messageInstance, interaction.user.id, spotifyProfile);
		} catch (error) {
			logger.error("UnlinkSpotifyCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer("An error occurred while processing your request.")],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createNotLinkedContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Spotify Profile**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**No Spotify Profile Linked**\n\n` +
			`**${emoji.get('cross')} Status:** Not Connected\n\n` +
			`You don't have a Spotify profile linked to your account.\n\n` +
			`**${emoji.get('add')} To link your profile:**\n` +
			`├─ Use \`link-spotify <profile_url>\`\n` +
			`├─ Get your profile URL from Spotify\n` +
			`└─ Access your public playlists through the bot\n\n` +
			`*Link your profile to access playlists and enhanced features*`;

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

	_createConfirmContainer(spotifyProfile) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('reset')} **Unlink Spotify Profile**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const linkedDate = spotifyProfile.linkedAt 
			? new Date(spotifyProfile.linkedAt).toLocaleDateString() 
			: 'Unknown';

		const content = `**Confirm Spotify Profile Removal**\n\n` +
			`**${emoji.get('folder')} Current Profile:** ${spotifyProfile.displayName || 'Unknown'}\n` +
			`**${emoji.get('info')} Linked Since:** ${linkedDate}\n\n` +
			`**${emoji.get('cross')} What will be removed:**\n` +
			`├─ Access to your public playlists\n` +
			`├─ Spotify profile connection\n` +
			`└─ Enhanced Spotify features\n\n` +
			`**${emoji.get('check')} What will be kept:**\n` +
			`├─ Your music listening history\n` +
			`├─ Bot preferences and settings\n` +
			`└─ All other bot data\n\n` +
			`*Are you sure you want to unlink your Spotify profile?*`;

		const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('unlink_confirm')
				.setLabel('Yes, Unlink')
				.setStyle(ButtonStyle.Danger)
				.setEmoji(emoji.get("cross")),
			new ButtonBuilder()
				.setCustomId('unlink_cancel')
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("reset"))
		);

		container.addActionRowComponents(buttonRow);

		return container;
	}

	_createSuccessContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('check')} **Profile Unlinked**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**Spotify profile successfully unlinked**\n\n` +
			`**${emoji.get('check')} Status:** Disconnected\n\n` +
			`Your Spotify profile has been removed from your account.\n\n` +
			`**${emoji.get('info')} What's next:**\n` +
			`├─ You can still use all other bot features\n` +
			`├─ Your music history and preferences are preserved\n` +
			`└─ Re-link anytime with \`link-spotify\`\n\n` +
			`*Thank you for using Yukihana!*`;

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

	_createCancelledContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Operation Cancelled**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**Spotify profile unlink cancelled**\n\n` +
			`**${emoji.get('check')} Status:** Still Connected\n\n` +
			`Your Spotify profile remains linked to your account.\n\n` +
			`*No changes have been made to your profile*`;

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

	_createExpiredContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get('info')} **Unlink Spotify**`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `**This interaction has expired**\n\n` +
			`Run the command again to unlink your Spotify profile\n\n` +
			`*Commands: \`unlink-spotify\`, \`spotify-unlink\`, \`disconnect-spotify\`*`;

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

	_setupCollector(message, userId, spotifyProfile) {
		const collector = message.createMessageComponentCollector({
			filter: (i) => i.user.id === userId,
			time: 300_000
		});

		collector.on('collect', async (interaction) => {
			try {
				if (interaction.customId === 'unlink_confirm') {
					db.user.unlinkSpotifyProfile(userId);
					await interaction.update({
						components: [this._createSuccessContainer()],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === 'unlink_cancel') {
					await interaction.update({
						components: [this._createCancelledContainer()],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			} catch (error) {
				logger.error("UnlinkSpotifyCommand", `Error in collector: ${error.message}`, error);
				await interaction.update({
					components: [this._createErrorContainer("An error occurred while processing your request.")],
					flags: MessageFlags.IsComponentsV2,
				}).catch(() => {});
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
					logger.error("UnlinkSpotifyCommand", `Error updating expired components: ${error.message}`, error);
				}
			}
		});
	}
}

export default new UnlinkSpotifyCommand();