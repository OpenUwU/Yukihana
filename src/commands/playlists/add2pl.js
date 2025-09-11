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
	StringSelectMenuBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

class Add2PlaylistCommand extends Command {
	constructor() {
		super({
			name: "add2pl",
			description: "Add current track or entire queue to a playlist",
			usage: "add2pl [playlist_name/id]",
			aliases: ["add-to-playlist", "a2pl"],
			category: "music",
			examples: ["add2pl", "add2pl My Favorites", "add2pl pl_abc123"],
			cooldown: 3,
			voiceRequired: true,
			sameVoiceRequired: true,
			enabledSlash: true,
			slashData: {
				name: "add2pl",
				description: "Add current track or entire queue to a playlist",
				options: [
					{
						name: "playlist",
						description: "Playlist name or ID",
						type: 3,
						required: false,
					},
				],
			},
		});
	}

	async execute({ client, message, args }) {
		const playlistIdentifier = args.join(" ") || null;
		return this._handleAdd2Playlist(client, message, playlistIdentifier);
	}

	async slashExecute({ client, interaction }) {
		const playlistIdentifier =
			interaction.options.getString("playlist") || null;
		return this._handleAdd2Playlist(client, interaction, playlistIdentifier);
	}

	async _handleAdd2Playlist(client, context, playlistIdentifier) {
		const userId = context.user?.id || context.author?.id;
		const guildId = context.guild.id;
		const player = client.music?.getPlayer(guildId);

		if (!player || !player.queue.current) {
			return this._reply(
				context,
				this._createErrorContainer("No music is currently playing."),
			);
		}

		if (playlistIdentifier) {
			return this._handleDirectAdd(context, userId, player, playlistIdentifier);
		} else {
			return this._showPlaylistSelection(context, userId, player);
		}
	}

	async _handleDirectAdd(context, userId, player, playlistIdentifier) {
		const playlist = this._findPlaylist(userId, playlistIdentifier);
		if (!playlist) {
			return this._reply(
				context,
				this._createErrorContainer(
					"Playlist not found. Check the name or ID and try again.",
				),
			);
		}

		const message = await this._reply(
			context,
			this._createPlaylistFoundContainer(playlist, player),
		);

		if (message) {
			this._setupDirectCollector(message, context, userId, player, playlist);
		}
	}

	async _showPlaylistSelection(context, userId, player) {
		const playlists = db.playlists.getUserPlaylists(userId);
		if (playlists.length === 0) {
			return this._reply(context, this._createNoPlaylistsContainer());
		}

		const message = await this._reply(
			context,
			this._createSelectionContainer(playlists, player),
		);

		if (message) {
			this._setupSelectionCollector(
				message,
				context,
				userId,
				player,
				playlists,
			);
		}
	}

	_findPlaylist(userId, identifier) {
		const playlists = db.playlists.getUserPlaylists(userId);

		return playlists.find(
			(pl) =>
				pl.id === identifier ||
				pl.name.toLowerCase() === identifier.toLowerCase() ||
				pl.id.replace("pl_", "").substring(0, 8) === identifier.toLowerCase(),
		);
	}

	_createNoPlaylistsContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Add to Playlist**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**No Playlists Found**\n\n` +
			`**${emoji.get("cross")} Status:** No playlists available\n\n` +
			`You don't have any playlists to add tracks to.\n\n` +
			`**${emoji.get("add")} Create your first playlist:**\n` +
			`└─ Use \`create-playlist <name>\`\n\n` +
			`*Create a playlist and come back to add tracks*`;

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

	_createSelectionContainer(playlists, player) {
		const container = new ContainerBuilder();
		const current = player.queue.current;
		const queueCount = player.queue.tracks.length;

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("add")} **Add to Playlist**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Select a Playlist**\n\n` +
			`**${emoji.get("music")} Current Track:** ${current.info.title}\n` +
			`**${emoji.get("folder")} Queue:** ${queueCount} tracks\n` +
			`**${emoji.get("info")} Your Playlists:** ${playlists.length}\n\n` +
			`Choose a playlist below, then select what to add:\n` +
			`├─ Current track only\n` +
			`└─ Entire queue\n\n` +
			`*Select a playlist from the dropdown menu*`;

		const thumbnailUrl =
			current.info.artworkUrl || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId("playlist_select")
			.setPlaceholder("Choose a playlist")
			.setMaxValues(1);

		playlists.forEach((playlist) => {
			const playlistId = playlist.id.replace("pl_", "").substring(0, 8);
			const trackCount = playlist.track_count || 0;
			const availableSlots = Math.max(0, 50 - trackCount);

			selectMenu.addOptions({
				label:
					playlist.name.length > 100
						? playlist.name.slice(0, 97) + "..."
						: playlist.name,
				description: `${trackCount}/50 tracks • ${availableSlots} slots available`,
				value: playlist.id,
			});
		});

		const actionRow = new ActionRowBuilder().addComponents(selectMenu);
		container.addActionRowComponents(actionRow);

		return container;
	}

	_createPlaylistFoundContainer(playlist, player) {
		const container = new ContainerBuilder();
		const current = player.queue.current;
		const queueCount = player.queue.tracks.length;
		const availableSlots = Math.max(0, 50 - playlist.track_count);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("folder")} **${playlist.name}**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Ready to Add Tracks**\n\n` +
			`**${emoji.get("music")} Current Track:** ${current.info.title}\n` +
			`**${emoji.get("folder")} Queue:** ${queueCount} tracks\n` +
			`**${emoji.get("info")} Playlist:** ${playlist.track_count}/50 tracks\n` +
			`**${emoji.get("add")} Available Slots:** ${availableSlots}\n\n` +
			`Choose what to add to this playlist:\n\n` +
			`*Use the buttons below to make your selection*`;

		const thumbnailUrl =
			current.info.artworkUrl || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId("add_current")
				.setLabel("Add Current Track")
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get("music"))
				.setDisabled(availableSlots < 1),
			new ButtonBuilder()
				.setCustomId("add_queue")
				.setLabel(
					`Add Queue (${Math.min(queueCount + 1, availableSlots)} tracks)`,
				)
				.setStyle(ButtonStyle.Success)
				.setEmoji(emoji.get("add"))
				.setDisabled(availableSlots < 1),
		);

		container.addActionRowComponents(buttonRow);

		return container;
	}

	_createAddContainer(playlist, player, selectedPlaylist) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("folder")} **${selectedPlaylist.name}**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const current = player.queue.current;
		const queueCount = player.queue.tracks.length;
		const availableSlots = Math.max(0, 50 - selectedPlaylist.track_count);

		const content =
			`**Choose What to Add**\n\n` +
			`**${emoji.get("music")} Current Track:** ${current.info.title}\n` +
			`**${emoji.get("folder")} Queue:** ${queueCount} tracks\n` +
			`**${emoji.get("info")} Playlist:** ${selectedPlaylist.track_count}/50 tracks\n` +
			`**${emoji.get("add")} Available Slots:** ${availableSlots}\n\n` +
			`Select what you want to add to this playlist:\n\n` +
			`*Use the buttons below to make your selection*`;

		const thumbnailUrl =
			current.info.artworkUrl || config.assets?.defaultTrackArtwork;

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId("add_current")
				.setLabel("Add Current Track")
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get("music"))
				.setDisabled(availableSlots < 1),
			new ButtonBuilder()
				.setCustomId("add_queue")
				.setLabel(
					`Add Queue (${Math.min(queueCount + 1, availableSlots)} tracks)`,
				)
				.setStyle(ButtonStyle.Success)
				.setEmoji(emoji.get("add"))
				.setDisabled(availableSlots < 1),
		);

		container.addActionRowComponents(buttonRow);

		return container;
	}

	_createSuccessContainer(playlist, addedCount, skippedCount, action) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("check")} **Successfully Added**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const actionText = action === "current" ? "current track" : "queue tracks";
		let statusText = `Added ${addedCount} track${addedCount > 1 ? "s" : ""} to playlist`;

		if (skippedCount > 0) {
			statusText += `. ${skippedCount} track${skippedCount > 1 ? "s" : ""} skipped (already in playlist or playlist full)`;
		}

		const content =
			`**Tracks Added to Playlist**\n\n` +
			`**${emoji.get("folder")} Playlist:** ${playlist.name}\n` +
			`**${emoji.get("add")} Action:** Added ${actionText}\n` +
			`**${emoji.get("check")} Added:** ${addedCount} track${addedCount > 1 ? "s" : ""}\n` +
			`**${emoji.get("info")} Total:** ${playlist.track_count}/50 tracks\n` +
			`${skippedCount > 0 ? `**${emoji.get("cross")} Skipped:** ${skippedCount} track${skippedCount > 1 ? "s" : ""}\n` : ""}` +
			`\n${statusText}\n\n` +
			`**${emoji.get("info")} Next Steps:**\n` +
			`├─ Use \`my-playlists\` to view all playlists\n` +
			`├─ Use \`playlist-info ${playlist.name}\` for details\n` +
			`└─ Use \`load-pl ${playlist.name}\` to play\n\n` +
			`*Your playlist has been updated successfully*`;

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
			new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Could not add to playlist**\n\n` +
			`**${emoji.get("cross")} Error:** ${message}\n\n` +
			`**${emoji.get("info")} Tips:**\n` +
			`├─ Make sure the playlist exists\n` +
			`├─ Check playlist name spelling\n` +
			`├─ Ensure playlist has available slots\n` +
			`└─ Use \`my-playlists\` to see all playlists\n\n` +
			`*Try again with correct parameters*`;

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

	_setupSelectionCollector(message, context, userId, player, playlists) {
		const filter = (i) => i.user.id === userId;
		const collector = message.createMessageComponentCollector({
			filter,
			time: 300000,
		});

		let selectedPlaylist = null;

		collector.on("collect", async (interaction) => {
			await interaction.deferUpdate();

			if (interaction.customId === "playlist_select") {
				const playlistId = interaction.values[0];
				selectedPlaylist = playlists.find((pl) => pl.id === playlistId);

				if (selectedPlaylist) {
					await interaction.editReply({
						components: [
							this._createAddContainer(playlists, player, selectedPlaylist),
						],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			} else if (
				interaction.customId === "add_current" ||
				interaction.customId === "add_queue"
			) {
				if (selectedPlaylist) {
					await this._processAdd(
						interaction,
						userId,
						player,
						selectedPlaylist,
						interaction.customId,
					);
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
						"Add2PlaylistCommand",
						"Error updating expired message",
						error,
					);
				}
			}
		});
	}

	_setupDirectCollector(message, context, userId, player, playlist) {
		const filter = (i) => i.user.id === userId;
		const collector = message.createMessageComponentCollector({
			filter,
			time: 300000,
		});

		collector.on("collect", async (interaction) => {
			await interaction.deferUpdate();
			await this._processAdd(
				interaction,
				userId,
				player,
				playlist,
				interaction.customId,
			);
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
						"Add2PlaylistCommand",
						"Error updating expired message",
						error,
					);
				}
			}
		});
	}

	async _processAdd(interaction, userId, player, playlist, action) {
		try {
			const current = player.queue.current;
			const queue = player.queue.tracks;
			let tracksToAdd = [];
			let addedCount = 0;
			let skippedCount = 0;

			if (action === "add_current") {
				tracksToAdd = [current];
			} else if (action === "add_queue") {
				tracksToAdd = [current, ...queue];
			}

			for (const track of tracksToAdd) {
				const availableSlots = 50 - (playlist.track_count + addedCount);
				if (availableSlots <= 0) break;

				const trackInfo = {
					identifier: track.info.identifier,
					title: track.info.title,
					author: track.info.author,
					uri: track.info.uri,
					duration: track.info.duration,
					sourceName: track.info.sourceName,
					artworkUrl: track.info.artworkUrl,
				};

				try {
					playlist = db.playlists.addTrackToPlaylist(
						playlist.id,
						userId,
						trackInfo,
					);
					addedCount++;
				} catch (error) {
					if (
						error.message.includes("already exists") ||
						error.message.includes("limit reached")
					) {
						skippedCount++;
					} else {
						throw error;
					}
				}
			}

			await interaction.editReply({
				components: [
					this._createSuccessContainer(
						playlist,
						addedCount,
						skippedCount,
						action.replace("add_", ""),
					),
				],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error) {
			logger.error("Add2PlaylistCommand", "Error processing add", error);
			await interaction.editReply({
				components: [
					this._createErrorContainer(
						"Failed to add tracks to playlist. Please try again.",
					),
				],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	}

	_createExpiredContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Interaction Expired**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**This interaction has expired**\n\n` +
			`**${emoji.get("reset")} Status:** Session timed out\n\n` +
			`Run the command again to add tracks to your playlists.\n\n` +
			`**${emoji.get("info")} Available Commands:**\n` +
			`├─ \`add2pl\` - Select from menu\n` +
			`├─ \`add2pl <playlist_name>\` - Direct add\n` +
			`└─ \`my-playlists\` - View all playlists\n\n` +
			`*Commands expire after 5 minutes of inactivity*`;

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
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};

		try {
			if (context.replied || context.deferred) {
				return context.editReply({ ...payload, fetchReply: true });
			} else if (typeof context.reply === "function") {
				return context.reply({ ...payload, fetchReply: true });
			} else {
				return context.channel.send(payload);
			}
		} catch (error) {
			logger.error("Add2PlaylistCommand", "Error in _reply", error);
			return null;
		}
	}
}

export default new Add2PlaylistCommand();
