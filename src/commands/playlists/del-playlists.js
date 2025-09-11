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

class DeletePlaylistCommand extends Command {
	constructor() {
		super({
			name: "delete-playlist",
			description: "Delete one of your custom playlists",
			usage: "delete-playlist <playlist_name_or_id>",
			aliases: ["delete-pl", "remove-playlist", "del-playlist"],
			category: "music",
			examples: [
				"delete-playlist My Favorites",
				"delete-pl pl_abc123",
				"remove-playlist Chill Vibes",
			],
			cooldown: 3,
			enabledSlash: true,
			slashData: {
				name: "delete-playlist",
				description: "Delete one of your custom playlists",
				options: [
					{
						name: "playlist",
						description: "Playlist name or ID to delete",
						type: 3,
						required: true,
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

		const playlistQuery = args.join(" ");
		return this._handleDelete(message.author, playlistQuery, message);
	}

	async slashExecute({ client, interaction }) {
		const playlistQuery = interaction.options.getString("playlist");
		return this._handleDelete(interaction.user, playlistQuery, interaction);
	}

	async _handleDelete(user, playlistQuery, context) {
		const loadingMessage = await this._reply(
			context,
			this._createLoadingContainer(playlistQuery),
		);

		try {
			const userPlaylists = db.playlists.getUserPlaylists(user.id);

			if (userPlaylists.length === 0) {
				return this._editReply(
					loadingMessage,
					this._createNoPlaylistsContainer(),
				);
			}

			let targetPlaylist = null;

			if (playlistQuery.startsWith("pl_")) {
				targetPlaylist = userPlaylists.find((pl) => pl.id === playlistQuery);
			} else {
				targetPlaylist = userPlaylists.find(
					(pl) => pl.name.toLowerCase() === playlistQuery.toLowerCase(),
				);
			}

			if (!targetPlaylist) {
				return this._editReply(
					loadingMessage,
					this._createNotFoundContainer(playlistQuery, userPlaylists),
				);
			}

			const success = db.playlists.deletePlaylist(targetPlaylist.id, user.id);

			if (success) {
				return this._editReply(
					loadingMessage,
					this._createSuccessContainer(targetPlaylist),
				);
			} else {
				throw new Error("Failed to delete playlist");
			}
		} catch (error) {
			logger.error("DeletePlaylistCommand", "Error deleting playlist", error);

			let errorMessage =
				"An error occurred while deleting the playlist. Please try again.";
			if (error.message === "Playlist not found") {
				errorMessage = "The specified playlist could not be found.";
			} else if (error.message === "Access denied") {
				errorMessage = "You don't have permission to delete this playlist.";
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
				`${emoji.get("info")} **Delete Playlist**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Missing Playlist Identifier**\n\n` +
			`**${emoji.get("cross")} Status:** Identifier Required\n\n` +
			`Please specify which playlist to delete.\n\n` +
			`**${emoji.get("info")} Usage:**\n` +
			`├─ \`delete-playlist <playlist_name>\`\n` +
			`├─ \`delete-pl <playlist_id>\`\n` +
			`├─ \`remove-playlist <playlist_name>\`\n` +
			`└─ \`del-playlist <playlist_name>\`\n\n` +
			`**${emoji.get("folder")} Examples:**\n` +
			`├─ \`delete-playlist My Favorites\`\n` +
			`├─ \`delete-pl pl_abc12345\`\n` +
			`└─ \`remove-playlist Chill Vibes\`\n\n` +
			`**${emoji.get("info")} Tips:**\n` +
			`├─ Use \`my-playlists\` to see all your playlists\n` +
			`├─ You can use playlist name or ID\n` +
			`├─ Deletion is permanent and cannot be undone\n` +
			`└─ Only you can delete your own playlists`;

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

	_createLoadingContainer(playlistQuery) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("loading")} **Deleting Playlist**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Locating and removing playlist**\n\n` +
			`**${emoji.get("loading")} Status:** Processing\n` +
			`**${emoji.get("folder")} Target:** ${playlistQuery}\n\n` +
			`Please wait while we locate and delete your playlist.\n\n` +
			`*Verifying permissions and removing data...*`;

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
				`${emoji.get("check")} **Playlist Deleted Successfully**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const deletedDate = new Date().toLocaleDateString();
		const playlistId = playlist.id.replace("pl_", "").substring(0, 8);

		const content =
			`**Playlist has been permanently removed**\n\n` +
			`**${emoji.get("cross")} Name:** ${playlist.name}\n` +
			`**${emoji.get("info")} ID:** ${playlistId}\n` +
			`**${emoji.get("music")} Tracks Lost:** ${playlist.track_count || 0} songs\n` +
			`**${emoji.get("check")} Deleted:** ${deletedDate}\n\n` +
			`**${emoji.get("info")} What happened:**\n` +
			`├─ Playlist completely removed\n` +
			`├─ All tracks removed from playlist\n` +
			`├─ Data permanently deleted\n` +
			`└─ Action cannot be undone\n\n` +
			`**${emoji.get("folder")} Next Steps:**\n` +
			`├─ Use \`create-playlist\` to make new ones\n` +
			`├─ Use \`my-playlists\` to see remaining playlists\n` +
			`└─ Use \`playlist-backup\` to backup others\n\n` +
			`*Playlist successfully removed from your collection*`;

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

	_createNoPlaylistsContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **No Playlists Found**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**You don't have any custom playlists**\n\n` +
			`**${emoji.get("folder")} Status:** No Playlists\n\n` +
			`You haven't created any custom playlists yet.\n\n` +
			`**${emoji.get("info")} Get Started:**\n` +
			`├─ Use \`create-playlist\` to make your first playlist\n` +
			`├─ Add your favorite tracks with \`add-track\`\n` +
			`├─ Organize your music collection\n` +
			`└─ Create up to 25 custom playlists\n\n` +
			`**${emoji.get("folder")} Examples:**\n` +
			`├─ \`create-playlist My Favorites\`\n` +
			`├─ \`create-pl Workout Songs High energy music\`\n` +
			`└─ \`new-playlist Chill Vibes Relaxing tunes\`\n\n` +
			`*Start building your music collection today!*`;

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

	_createNotFoundContainer(playlistQuery, userPlaylists) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Playlist Not Found**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const playlistList = userPlaylists
			.slice(0, 5)
			.map((pl) => `├─ ${pl.name} (${pl.track_count || 0} tracks)`)
			.join("\n");

		const moreText =
			userPlaylists.length > 5
				? `└─ ...and ${userPlaylists.length - 5} more\n\n`
				: "└─ \n\n";

		const content =
			`**Could not find the specified playlist**\n\n` +
			`**${emoji.get("cross")} Search:** ${playlistQuery}\n` +
			`**${emoji.get("folder")} Your Playlists:** ${userPlaylists.length} total\n\n` +
			`**${emoji.get("info")} Available Playlists:**\n` +
			`${playlistList}\n` +
			`${moreText}` +
			`**${emoji.get("info")} Tips:**\n` +
			`├─ Check spelling of playlist name\n` +
			`├─ Use exact playlist name or ID\n` +
			`├─ Use \`my-playlists\` to see all playlists\n` +
			`└─ Playlist names are case-insensitive\n\n` +
			`*Please verify the playlist name and try again*`;

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
				`${emoji.get("cross")} **Deletion Failed**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Could not delete playlist**\n\n` +
			`**${emoji.get("cross")} Error:** ${message}\n\n` +
			`**${emoji.get("info")} Possible Solutions:**\n` +
			`├─ Verify you own the playlist\n` +
			`├─ Check if playlist still exists\n` +
			`├─ Try again in a few moments\n` +
			`└─ Use exact playlist name or ID\n\n` +
			`**${emoji.get("folder")} Need Help:**\n` +
			`├─ Use \`my-playlists\` to see your playlists\n` +
			`├─ Use \`playlist-info <n>\` for details\n` +
			`└─ Contact support if problem persists\n\n` +
			`*Please try again or contact support*`;

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

export default new DeletePlaylistCommand();
