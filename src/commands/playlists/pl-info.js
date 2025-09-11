import { Command } from "#structures/classes/Command";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	StringSelectMenuBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

const TRACKS_PER_PAGE = 10;

class PlaylistInfoCommand extends Command {
	constructor() {
		super({
			name: "playlist-info",
			description: "View detailed information and manage a custom playlist",
			usage: "playlist-info [playlist_id_or_name]",
			aliases: ["pl-info", "p-info"],
			category: "music",
			examples: [
				"playlist-info",
				"playlist-info My Favorites",
				"pl-info pl_abc123",
			],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: "playlist-info",
				description: "View detailed info for a playlist",
				options: [
					{
						name: "playlist",
						description: "The ID or name of the playlist to view",
						type: 3,
						required: false,
					},
				],
			},
		});
	}

	async execute({ client, message, args }) {
		const query = args.join(" ") || null;
		return this._handleInfo(client, message, message.author, query);
	}

	async slashExecute({ client, interaction }) {
		const query = interaction.options.getString("playlist") || null;
		return this._handleInfo(client, interaction, interaction.user, query);
	}

	async _handleInfo(client, context, user, query) {
		const userId = user.id;

		if (query) {
			const playlist = this._findPlaylist(userId, query);
			if (!playlist) {
				return this._reply(
					context,
					this._createNotFoundContainer(query, userId),
				);
			}
			const message = await this._reply(
				context,
				this._createMainInfoContainer(playlist),
			);
			if (message) this._setupCollector(message, userId, playlist);
		} else {
			const playlists = db.playlists.getUserPlaylists(userId);
			if (playlists.length === 0) {
				return this._reply(context, this._createNoPlaylistsContainer());
			}
			const message = await this._reply(
				context,
				this._createSelectionContainer(playlists),
			);
			if (message) this._setupCollector(message, userId, null, playlists);
		}
	}

	_findPlaylist(userId, query) {
		const userPlaylists = db.playlists.getUserPlaylists(userId);
		const trimmedQuery = query.trim();

		if (trimmedQuery.startsWith("pl_")) {
			return userPlaylists.find((p) => p.id === trimmedQuery);
		}
		if (trimmedQuery.length <= 16 && !trimmedQuery.includes(" ")) {
			const playlistById = userPlaylists.find((p) =>
				p.id.includes(trimmedQuery),
			);
			if (playlistById) return playlistById;
		}
		return userPlaylists.find(
			(p) => p.name.toLowerCase() === trimmedQuery.toLowerCase(),
		);
	}

	_createSelectionContainer(playlists) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("folder")} **Your Playlists**`,
			),
		);
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Select a playlist**\n\n` +
			`You have **${playlists.length}** playlists. Choose one from the menu below to view its details and manage its tracks.`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets?.defaultThumbnail ||
							config.assets?.defaultTrackArtwork,
					),
				),
		);

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId("plinfo_select")
			.setPlaceholder("Choose a playlist...")
			.addOptions(
				playlists.slice(0, 25).map((pl) => ({
					label: pl.name.substring(0, 100),
					description:
						`${pl.track_count} tracks | Last updated: ${new Date(pl.updated_at).toLocaleDateString()}`.substring(
							0,
							100,
						),
					value: pl.id,
				})),
			);

		container.addActionRowComponents(
			new ActionRowBuilder().addComponents(selectMenu),
		);
		return container;
	}

	_createMainInfoContainer(playlist) {
		const container = new ContainerBuilder();
		const shortId = playlist.id.replace("pl_", "").substring(0, 8);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("openfolder")} **Playlist Details: ${playlist.name}**`,
			),
		);
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const description = playlist.description
			? `**${emoji.get("info")} Description:** ${playlist.description}\n`
			: "";
		const content =
			`**Overview of your playlist**\n\n` +
			`**${emoji.get("folder")} Name:** ${playlist.name}\n` +
			`${description}` +
			`**${emoji.get("info")} ID:** ${shortId}\n` +
			`**${emoji.get("music")} Tracks:** ${playlist.track_count} songs\n` +
			`**${emoji.get("reset")} Duration:** ${this._formatDuration(playlist.total_duration)}\n` +
			`**${emoji.get("check")} Created:** ${new Date(playlist.created_at).toLocaleString()}\n` +
			`**${emoji.get("add")} Updated:** ${new Date(playlist.updated_at).toLocaleString()}`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets?.defaultThumbnail ||
							config.assets?.defaultTrackArtwork,
					),
				),
		);

		const buttons = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`plinfo_view_tracks_${playlist.id}`)
				.setLabel("View Tracks")
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get("music"))
				.setDisabled(playlist.track_count === 0),
		);
		container.addActionRowComponents(buttons);
		return container;
	}

	_createTracksContainer(playlist, page) {
		const container = new ContainerBuilder();
		const tracks = playlist.tracks;
		const totalPages = Math.ceil(tracks.length / TRACKS_PER_PAGE) || 1;
		page = Math.max(1, Math.min(page, totalPages));

		const startIdx = (page - 1) * TRACKS_PER_PAGE;
		const endIdx = startIdx + TRACKS_PER_PAGE;
		const pageTracks = tracks.slice(startIdx, endIdx);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("music")} **Tracks in: ${playlist.name}**`,
			),
		);
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		let tracksContent = `**Page ${page} of ${totalPages}**\n\n`;
		pageTracks.forEach((track, index) => {
			const globalIndex = startIdx + index + 1;
			tracksContent +=
				`**${globalIndex}.** ${track.title}\n` +
				`   └─ *by ${track.author || "Unknown"}* | \`${this._formatDuration(track.duration)}\`\n`;
		});

		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(tracksContent),
				),
		);

		if (pageTracks.length > 0) {
			const removeMenu = new StringSelectMenuBuilder()
				.setCustomId(`plinfo_remove_tracks_${playlist.id}`)
				.setPlaceholder("Select tracks to remove from this page")
				.setMinValues(1)
				.setMaxValues(pageTracks.length)
				.addOptions(
					pageTracks.map((track, index) => ({
						label: track.title.substring(0, 100),
						description: `by ${track.author || "Unknown"}`.substring(0, 100),
						value: track.identifier,
					})),
				);
			container.addActionRowComponents(
				new ActionRowBuilder().addComponents(removeMenu),
			);
		}

		const navButtons = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`plinfo_tracks_prev_${playlist.id}_${page}`)
				.setLabel("Previous")
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("left"))
				.setDisabled(page <= 1),
			new ButtonBuilder()
				.setCustomId(`plinfo_back_to_info_${playlist.id}`)
				.setLabel("Back to Info")
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get("reset")),
			new ButtonBuilder()
				.setCustomId(`plinfo_tracks_next_${playlist.id}_${page}`)
				.setLabel("Next")
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("right"))
				.setDisabled(page >= totalPages),
		);
		container.addActionRowComponents(navButtons);

		return container;
	}

	_setupCollector(message, userId, initialPlaylist, allPlaylists = null) {
		const filter = (i) => i.user.id === userId;
		const collector = message.createMessageComponentCollector({
			filter,
			time: 300000,
		});

		let currentPlaylist = initialPlaylist;
		let currentPage = 1;

		collector.on("collect", async (interaction) => {
			await interaction.deferUpdate();
			const [action, ...params] = interaction.customId.split("_");

			if (action !== "plinfo") return;

			const subAction = params[0];

			switch (subAction) {
				case "select": {
					const playlistId = interaction.values[0];
					currentPlaylist = allPlaylists.find((p) => p.id === playlistId);
					if (currentPlaylist) {
						await interaction.editReply({
							components: [this._createMainInfoContainer(currentPlaylist)],
						});
					}
					break;
				}
				case "view": {
					// view_tracks
					currentPage = 1;
					await interaction.editReply({
						components: [
							this._createTracksContainer(currentPlaylist, currentPage),
						],
					});
					break;
				}
				case "back": {
					// back_to_info
					await interaction.editReply({
						components: [this._createMainInfoContainer(currentPlaylist)],
					});
					break;
				}
				case "tracks": {
					// tracks_prev or tracks_next
					const direction = params[1];
					currentPage =
						direction === "prev" ? currentPage - 1 : currentPage + 1;
					await interaction.editReply({
						components: [
							this._createTracksContainer(currentPlaylist, currentPage),
						],
					});
					break;
				}
				case "remove": {
					// remove_tracks
					const identifiersToRemove = interaction.values;
					let removedCount = 0;
					for (const id of identifiersToRemove) {
						try {
							await db.playlists.removeTrackFromPlaylist(
								currentPlaylist.id,
								userId,
								id,
							);
							removedCount++;
						} catch (e) {
							logger.error(
								"PlaylistInfo",
								`Failed to remove track ${id} from ${currentPlaylist.id}`,
								e,
							);
						}
					}

					currentPlaylist = db.playlists.getPlaylist(currentPlaylist.id);

					const totalPages =
						Math.ceil(currentPlaylist.tracks.length / TRACKS_PER_PAGE) || 1;
					if (currentPage > totalPages) currentPage = totalPages;

					await interaction.editReply({
						components: [
							this._createTracksContainer(currentPlaylist, currentPage),
						],
					});
					await interaction.followUp({
						content: `${emoji.get("check")} Successfully removed ${removedCount} track(s).`,
						ephemeral: true,
					});
					break;
				}
			}
		});

		collector.on("end", async () => {
			try {
				await message.edit({
					components: [this._createExpiredContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			} catch (error) {
				if (error.code !== 10008) {
					logger.error(
						"PlaylistInfo",
						"Failed to edit message on collector end",
						error,
					);
				}
			}
		});
	}

	_formatDuration(ms) {
		if (!ms || ms < 0) return "0:00";
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		}
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	// --- Standard Container Functions ---

	_createNoPlaylistsContainer() {
		return new ContainerBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`${emoji.get("info")} **No Playlists Found**`,
				),
			)
			.addSeparatorComponents(new SeparatorBuilder())
			.addSectionComponents(
				new SectionBuilder()
					.setThumbnailAccessory(
						new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
					)
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(
							`You don't have any custom playlists yet.\n\nUse \`/create-playlist <name>\` to get started!`,
						),
					),
			);
	}

	_createNotFoundContainer(query, userId) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Playlist Not Found**`,
			),
		);
		container.addSeparatorComponents(new SeparatorBuilder());
		const content =
			`Could not find a playlist matching \`${query}\`.\n\n` +
			`**Tips:**\n` +
			`├─ Check the spelling of the playlist name.\n` +
			`├─ Try using the playlist's ID.\n` +
			`└─ Use \`/my-playlists\` to see a list of your playlists.`;
		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
		);
		return container;
	}

	_createExpiredContainer() {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Interaction Expired**`,
			),
		);
		container.addSeparatorComponents(new SeparatorBuilder());
		const content = `This interactive menu has expired.\nPlease run the command again.`;
		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
		);
		return container;
	}

	async _reply(context, container) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			fetchReply: true,
		};
		try {
			if (context.replied || context.deferred) {
				return context.editReply(payload);
			}
			return context.reply(payload);
		} catch (error) {
			logger.error("PlaylistInfoCommand", "Error in _reply", error);
			return null;
		}
	}
}

export default new PlaylistInfoCommand();
