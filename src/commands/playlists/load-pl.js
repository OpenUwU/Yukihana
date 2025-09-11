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
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

const MAX_TRACKS_TO_ADD = 50;

class LoadPlaylistCommand extends Command {
	constructor() {
		super({
			name: "load-playlist",
			description: "Load a playlist, or specific tracks/ranges from it",
			usage: "load-playlist <playlist_name_or_id> [positions]",
			aliases: ["load-pl", "lpl"],
			category: "music",
			examples: [
				"lpl My Favorites",
				"lpl ChillVibes 5",
				"load-pl MyFavorites 3, 7, 10",
				"lpl RockClassics 5-10",
			],
			cooldown: 5,
			voiceRequired: true,
			sameVoiceRequired: true,
			enabledSlash: true,
			slashData: {
				name: "load-playlist",
				description: "Load a playlist or specific tracks/ranges from it",
				options: [
					{
						name: "playlist",
						description: "Playlist ID or name to load",
						type: 3,
						required: true,
					},
					{
						name: "positions",
						description: "Optional: Specific tracks or ranges (e.g., 5, 8-10)",
						type: 3,
						required: false,
					},
				],
			},
		});
	}

	async execute({ client, message, args }) {
		if (args.length === 0) {
			return message.reply({ components: [this._createUsageContainer()] });
		}

		let positionsStr = null;
		let query = args.join(" ");

	
		const lastArg = args[args.length - 1];
		if (args.length > 1 && /^[0-9,-]+$/.test(lastArg)) {
			positionsStr = args.pop();
			query = args.join(" ");
		}

		return this._handleLoad(
			client,
			message,
			query,
			message.author,
			positionsStr,
		);
	}

	async slashExecute({ client, interaction }) {
		const query = interaction.options.getString("playlist");
		const positionsStr = interaction.options.getString("positions") || null;
		return this._handleLoad(
			client,
			interaction,
			query,
			interaction.user,
			positionsStr,
		);
	}

	async _handleLoad(client, context, query, user, positionsStr) {
		const loadingMessage = await this._reply(
			context,
			this._createLoadingContainer(query),
		);

		try {
			const playlist = this._findPlaylist(user.id, query);
			if (!playlist)
				return this._editReply(
					loadingMessage,
					this._createNotFoundContainer(query),
				);
			if (!playlist.tracks || playlist.tracks.length === 0)
				return this._editReply(
					loadingMessage,
					this._createEmptyPlaylistContainer(playlist),
				);

			let tracksToProcess;
			let selectionInfo;

			if (positionsStr) {
				const indices = this._parseTrackIndices(
					positionsStr,
					playlist.tracks.length,
				);
				if (indices.length === 0) {
					return this._editReply(
						loadingMessage,
						this._createErrorContainer(
							`**Invalid Track Selection**\n\nThe positions \`${positionsStr}\` are invalid or out of range for this playlist (1-${playlist.tracks.length}).`,
						),
					);
				}
				tracksToProcess = indices.map((index) => playlist.tracks[index]);
				selectionInfo = `${indices.length} selected track(s)`;
			} else {
				tracksToProcess = playlist.tracks.slice(0, MAX_TRACKS_TO_ADD);
				selectionInfo = `up to ${MAX_TRACKS_TO_ADD} tracks`;
			}

	
			const voiceChannel = context.member?.voice?.channel;
			if (!voiceChannel)
				return this._editReply(
					loadingMessage,
					this._createErrorContainer(
						`**Voice Channel Required**\n\nYou must be in a voice channel to play music.`,
					),
				);
			const permissions = voiceChannel.permissionsFor(context.guild.members.me);
			if (!permissions.has(["Connect", "Speak"]))
				return this._editReply(
					loadingMessage,
					this._createErrorContainer(
						`**Missing Permissions**\n\nI need permission to join and speak in your voice channel.`,
					),
				);

			let player = client.music?.getPlayer(context.guild.id);
			const wasEmpty =
				!player || (player.queue.tracks.length === 0 && !player.playing);
			const currentQueueSize = wasEmpty ? 0 : player.queue.tracks.length;
			const queueCheck = this._checkQueueLimit(
				currentQueueSize,
				tracksToProcess.length,
				context.guild.id,
				user.id,
			);

			if (!queueCheck.allowed)
				return this._editReply(
					loadingMessage,
					this._createErrorContainer(
						`**Queue Limit Reached**\n\n${queueCheck.message}`,
					),
				);

			if (!player)
				player = await client.music.createPlayer({
					guildId: context.guild.id,
					textChannelId: context.channel.id,
					voiceChannelId: voiceChannel.id,
				});
			const pm = new PlayerManager(player);
			if (!pm.isConnected) await pm.connect();

			const finalTracks = tracksToProcess.slice(0, queueCheck.tracksToAdd);
			let addedCount = 0;
			let failedCount = 0;

			await this._editReply(
				loadingMessage,
				this._createProcessingContainer(
					playlist.name,
					0,
					finalTracks.length,
					selectionInfo,
				),
			);

			for (let i = 0; i < finalTracks.length; i++) {
				const track = finalTracks[i];
				const searchQuery = track.author
					? `${track.title} ${track.author}`
					: track.title;
				const searchResult = await client.music.search(searchQuery, {
					requester: user,
				});

				if (searchResult?.tracks?.length > 0) {
					await pm.addTracks(searchResult.tracks[0]);
					addedCount++;
				} else {
					failedCount++;
				}
			
			}

			if (wasEmpty && addedCount > 0) await pm.play();

			const premiumStatus = this._getPremiumStatus(context.guild.id, user.id);
			return this._editReply(
				loadingMessage,
				this._createSuccessContainer(
					playlist,
					addedCount,
					failedCount,
					finalTracks.length,
					premiumStatus,
					queueCheck.limitWarning,
					wasEmpty && addedCount > 0,
				),
			);
		} catch (error) {
			logger.error("LoadPlaylistCommand", "Error loading playlist", error);
			return this._editReply(
				loadingMessage,
				this._createErrorContainer(
					`An unexpected error occurred while loading the playlist.`,
				),
			);
		}
	}

	_parseTrackIndices(str, max) {
		const indices = new Set();
		const parts = str.split(",");

		for (const part of parts) {
			if (part.includes("-")) {
				const [start, end] = part.trim().split("-").map(Number);
				if (
					!isNaN(start) &&
					!isNaN(end) &&
					start <= end &&
					start > 0 &&
					end <= max
				) {
					for (let i = start; i <= end; i++) {
						indices.add(i - 1); // 1-based to 0-based
					}
				}
			} else {
				const num = Number(part.trim());
				if (!isNaN(num) && num > 0 && num <= max) {
					indices.add(num - 1); // 1-based to 0-based
				}
			}
		}
		return Array.from(indices);
	}

	_findPlaylist(userId, query) {
		const userPlaylists = db.playlists.getUserPlaylists(userId);
		const trimmedQuery = query.trim();
		if (trimmedQuery.startsWith("pl_"))
			return userPlaylists.find((p) => p.id === trimmedQuery);
		if (trimmedQuery.length <= 16 && !trimmedQuery.includes(" ")) {
			const byId = userPlaylists.find((p) => p.id.includes(trimmedQuery));
			if (byId) return byId;
		}
		return userPlaylists.find(
			(p) => p.name.toLowerCase() === trimmedQuery.toLowerCase(),
		);
	}

	_createUsageContainer() {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Load Playlist Command**`,
			),
		);
		const content =
			`**Usage:** \`load-playlist <name_or_id> [positions]\`\n\n` +
			`Load an entire playlist or just specific tracks.\n\n` +
			`**Examples:**\n` +
			`├─ \`lpl My Favorites\` (loads all)\n` +
			`├─ \`lpl ChillVibes 5\` (loads track 5)\n` +
			`├─ \`lpl MyFavorites 3,7,10\` (loads 3, 7, 10)\n` +
			`└─ \`lpl RockClassics 5-10\` (loads 5 through 10)`;
		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComoponents(
					new TextDisplayBuilder().setContent(content),
				),
		);
		return container;
	}

	_createProcessingContainer(
		playlistName,
		processedCount,
		totalCount,
		selectionInfo,
	) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("loading")} **Loading Playlist Tracks**`,
			),
		);
		const progress =
			totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
		const content =
			`**Adding songs to queue...**\n\n` +
			`**${emoji.get("folder")} Playlist:** ${playlistName}\n` +
			`**${emoji.get("music")} Selection:** Loading ${selectionInfo}\n` +
			`**${emoji.get("loading")} Progress:** ${processedCount}/${totalCount} (${progress}%)`;
		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
		);
		return container;
	}

	_createSuccessContainer(
		playlist,
		added,
		failed,
		totalSelected,
		premium,
		limitWarning,
		wasPlaying,
	) {
		const container = new ContainerBuilder();
		const title = wasPlaying ? "Playlist Playing" : "Playlist Loaded";
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get("check")} **${title}**`),
		);
		const statusText = wasPlaying ? "Started playing" : "Added to queue";
		const content =
			`**Loaded tracks from ${playlist.name}**\n\n` +
			`**${emoji.get("check")} Added:** ${added} / ${totalSelected} selected tracks\n` +
			`${failed > 0 ? `**${emoji.get("cross")} Failed:** ${failed} tracks (not found)\n` : ""}` +
			`**${emoji.get("music")} Status:** ${statusText}\n\n` +
			`**Queue Info:** ${premium.hasPremium ? "Premium" : "Free"} Tier (${premium.maxSongs} limit)\n` +
			`${limitWarning ? `**${emoji.get("info")} Notice:** ${limitWarning}` : ""}`;
		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
		);
		return container;
	}

	
	_createLoadingContainer(query) {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("loading")} Loading playlist \`${query}\`...`,
			),
		);
	}
	_createNotFoundContainer(query) {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Playlist Not Found**\nCould not find a playlist matching \`${query}\`.`,
			),
		);
	}
	_createEmptyPlaylistContainer(playlist) {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Empty Playlist**\nThe playlist \`${playlist.name}\` has no tracks to load.`,
			),
		);
	}
	_createErrorContainer(message) {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Error**\n${message}`,
			),
		);
	}
	_getPremiumStatus(guildId, userId) {
		const premiumStatus = db.hasAnyPremium(userId, guildId);
		return {
			hasPremium: !!premiumStatus,
			maxSongs: premiumStatus
				? config.queue.maxSongs.premium
				: config.queue.maxSongs.free,
		};
	}
	_checkQueueLimit(currentQueueSize, tracksToAdd, guildId, userId) {
		const premiumStatus = this._getPremiumStatus(guildId, userId);
		const availableSlots = premiumStatus.maxSongs - currentQueueSize;
		if (availableSlots <= 0)
			return {
				allowed: false,
				message: `Queue is full (${premiumStatus.maxSongs} songs).`,
			};
		const canAddAll = tracksToAdd <= availableSlots;
		const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;
		let limitWarning = !canAddAll
			? `Only ${tracksToAddActual} tracks could be added due to queue limit.`
			: null;
		return {
			allowed: true,
			canAddAll,
			tracksToAdd: tracksToAddActual,
			limitWarning,
		};
	}
	async _reply(context, container) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			fetchReply: true,
		};
		if (context.replied || context.deferred) return context.editReply(payload);
		return context.reply(payload);
	}
	async _editReply(message, container) {
		if (!message) return null;
		return message.edit({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		});
	}
}

export default new LoadPlaylistCommand();
