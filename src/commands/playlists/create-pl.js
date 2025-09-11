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
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

class CreatePlaylistCommand extends Command {
	constructor() {
		super({
			name: "create-playlist",
			description: "Create a new custom playlist",
			usage: "create-playlist <name> [description]",
			aliases: ["create-pl", "new-playlist", "make-playlist"],
			category: "music",
			examples: [
				"create-playlist My Favorites",
				"create-pl Chill Vibes A relaxing collection",
				"new-playlist Rock Classics Best rock songs ever",
			],
			cooldown: 3,
			enabledSlash: true,
			slashData: {
				name: "create-playlist",
				description: "Create a new custom playlist",
				options: [
					{
						name: "name",
						description: "Playlist name",
						type: 3,
						required: true,
					},
					{
						name: "description",
						description: "Playlist description (optional)",
						type: 3,
						required: false,
					},
				],
			},
		});
	}

	async execute({ client, message, args }) {
		if (args.length === 0) {
			return message.reply({
				components: [this._createUsageContainer()],
				flags: MessageFlags.IsComponentsV2,
			});
		}

		const name = args[0];
		const description = args.slice(1).join(" ") || null;

		return this._handleCreate(message.author, name, description, message);
	}

	async slashExecute({ client, interaction }) {
		const name = interaction.options.getString("name");
		const description = interaction.options.getString("description") || null;

		return this._handleCreate(interaction.user, name, description, interaction);
	}

	async _handleCreate(user, name, description, context) {
		const loadingMessage = await this._reply(
			context,
			this._createLoadingContainer(name),
		);

		try {
			const playlist = db.playlists.createPlaylist(user.id, name, description);

			return this._editReply(
				loadingMessage,
				this._createSuccessContainer(playlist),
			);
		} catch (error) {
			logger.error("CreatePlaylistCommand", "Error creating playlist", error);

			let errorMessage =
				"An error occurred while creating your playlist. Please try again.";
			if (error.message === "Invalid playlist name") {
				errorMessage =
					"Please provide a valid playlist name (1-100 characters).";
			} else if (error.message === "Description too long") {
				errorMessage = "Playlist description is too long (max 500 characters).";
			} else if (error.message === "Maximum playlist limit reached") {
				errorMessage = "You've reached the maximum limit of 25 playlists.";
			} else if (error.message === "Playlist with this name already exists") {
				errorMessage =
					"You already have a playlist with this name. Choose a different name.";
			}

			return this._editReply(
				loadingMessage,
				this._createErrorContainer(errorMessage),
			);
		}
	}

	_createUsageContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Create Playlist**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Missing Playlist Name**\n\n` +
			`**${emoji.get("cross")} Status:** Name Required\n\n` +
			`Please provide a name for your new playlist.\n\n` +
			`**${emoji.get("info")} Usage:**\n` +
			`├─ \`create-playlist <name> [description]\`\n` +
			`├─ \`create-pl <name> [description]\`\n` +
			`├─ \`new-playlist <name> [description]\`\n` +
			`└─ \`make-playlist <name> [description]\`\n\n` +
			`**${emoji.get("folder")} Examples:**\n` +
			`├─ \`create-playlist My Favorites\`\n` +
			`├─ \`create-pl Chill Vibes A relaxing collection\`\n` +
			`└─ \`new-playlist Rock Classics Best rock songs\`\n\n` +
			`**${emoji.get("info")} Limits:**\n` +
			`├─ Maximum 25 playlists per user\n` +
			`├─ Name: 1-100 characters\n` +
			`├─ Description: 0-500 characters\n` +
			`└─ Up to 500 tracks per playlist`;

		const thumbnailUrl =
			config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
	}

	_createLoadingContainer(name) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("loading")} **Creating Playlist**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Setting up your new playlist**\n\n` +
			`**${emoji.get("loading")} Status:** Creating\n` +
			`**${emoji.get("folder")} Name:** ${name}\n\n` +
			`Please wait while we create your custom playlist.\n\n` +
			`*This should only take a moment...*`;

		const thumbnailUrl =
			config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
	}

	_createSuccessContainer(playlist) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("check")} **Playlist Created Successfully**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const createdDate = new Date(playlist.created_at).toLocaleDateString();
		const playlistId = playlist.id.replace("pl_", "").substring(0, 8);

		let descriptionText = "";
		if (playlist.description) {
			descriptionText = `**${emoji.get("info")} Description:** ${playlist.description}\n`;
		}

		const content =
			`**Your new playlist is ready to use**\n\n` +
			`**${emoji.get("folder")} Name:** ${playlist.name}\n` +
			`${descriptionText}` +
			`**${emoji.get("info")} ID:** ${playlistId}\n` +
			`**${emoji.get("check")} Created:** ${createdDate}\n` +
			`**${emoji.get("music")} Tracks:** 0 songs\n\n` +
			`**${emoji.get("info")} Next Steps:**\n` +
			`├─ Use \`add-track\` to add songs\n` +
			`├─ Use \`playlist-info\` to view details\n` +
			`├─ Use \`my-playlists\` to see all playlists\n` +
			`└─ Use \`play-playlist\` to start playing\n\n` +
			`*Start building your perfect playlist!*`;

		const thumbnailUrl =
			config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
	}

	_createErrorContainer(message) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Creation Failed**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Could not create playlist**\n\n` +
			`**${emoji.get("cross")} Error:** ${message}\n\n` +
			`**${emoji.get("info")} Tips:**\n` +
			`├─ Choose a unique playlist name\n` +
			`├─ Keep names under 100 characters\n` +
			`├─ Keep descriptions under 500 characters\n` +
			`└─ You can have maximum 25 playlists\n\n` +
			`*Please try again with different parameters*`;

		const thumbnailUrl =
			config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
	}

	async _reply(context, container) {
		if (context.replied || context.deferred) {
			return context.editReply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
			});
		} else if (context.reply) {
			return context.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
			});
		} else {
			return context.editReply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	}

	async _editReply(message, container) {
		return message.edit({ components: [container] });
	}
}

export default new CreatePlaylistCommand();
