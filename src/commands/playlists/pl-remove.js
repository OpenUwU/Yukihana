import { Command } from "#structures/classes/Command";
import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from "discord.js";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

class RemoveTrackCommand extends Command {
	constructor() {
		super({
			name: "remove-track",
			description: "Remove tracks from a playlist by position or range",
			usage: "remove-track <playlist_name_or_id> <positions>",
			aliases: ["rm-track", "pl-remove"],
			category: "music",
			examples: [
				"remove-track MyFavorites 5",
				"rm-track MyFavorites 3, 7, 10",
				"pl-remove MyFavorites 5-10",
			],
			cooldown: 3,
			enabledSlash: true,
			slashData: {
				name: "remove-track",
				description: "Remove tracks from a playlist",
				options: [
					{
						name: "playlist",
						description: "The ID or name of the playlist",
						type: 3,
						required: true,
					},
					{
						name: "positions",
						description: "Track numbers or ranges to remove (e.g., 5, 8-10)",
						type: 3,
						required: true,
					},
				],
			},
		});
	}

	async execute({ message, args }) {
		if (args.length < 2)
			return message.reply({ embeds: [this._createUsageContainer()] });

		const positions = args.pop();
		const query = args.join(" ");

		return this._handleRemove(message.author, message, query, positions);
	}

	async slashExecute({ interaction }) {
		const query = interaction.options.getString("playlist");
		const positions = interaction.options.getString("positions");
		return this._handleRemove(interaction.user, interaction, query, positions);
	}

	async _handleRemove(user, context, query, positionsStr) {
		const playlist = this._findPlaylist(user.id, query);
		if (!playlist)
			return this._reply(
				context,
				this._createErrorContainer(
					`Playlist not found for query: \`${query}\``,
				),
			);
		if (playlist.tracks.length === 0)
			return this._reply(
				context,
				this._createErrorContainer("This playlist is empty."),
			);

		const indicesToRemove = this._parseTrackIndices(
			positionsStr,
			playlist.tracks.length,
		);
		if (indicesToRemove.length === 0) {
			return this._reply(
				context,
				this._createErrorContainer(
					"Invalid or out-of-range track numbers provided.",
				),
			);
		}

		const removedTracks = [];
		let successCount = 0;
		let failCount = 0;

		indicesToRemove.sort((a, b) => b - a);

		for (const index of indicesToRemove) {
			const track = playlist.tracks[index];
			if (track) {
				try {
					await db.playlists.removeTrackFromPlaylist(
						playlist.id,
						user.id,
						track.identifier,
					);
					removedTracks.push(`**${index + 1}.** ${track.title}`);
					successCount++;
				} catch (error) {
					logger.error(
						"RemoveTrack",
						`Failed to remove track at index ${index}`,
						error,
					);
					failCount++;
				}
			}
		}

		const finalPlaylist = db.playlists.getPlaylist(playlist.id);
		return this._reply(
			context,
			this._createSuccessContainer(
				finalPlaylist,
				removedTracks,
				successCount,
				failCount,
			),
		);
	}

	_parseTrackIndices(str, max) {
		const indices = new Set();
		const parts = str.split(",");

		for (const part of parts) {
			if (part.includes("-")) {
				const [start, end] = part.split("-").map(Number);
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
				const num = Number(part);
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

	_createSuccessContainer(playlist, removedTracks, success, failed) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("check")} **Tracks Removed from ${playlist.name}**`,
			),
		);

		let description = `Successfully removed **${success}** track(s).\n\n`;
		description += removedTracks.slice(0, 10).join("\n");
		if (removedTracks.length > 10)
			description += `\n...and ${removedTracks.length - 10} more.`;
		if (failed > 0)
			description += `\n\n${emoji.get("cross")} Failed to remove **${failed}** track(s).`;

		description += `\n\n**Playlist now has ${playlist.track_count} tracks.**`;

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(description),
		);
		return container;
	}

	_createErrorContainer(message) {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Error**\n${message}`,
			),
		);
	}
	_createUsageContainer() {
		const UsageContainer = new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Remove Track Command**`,
			),
		);
		const content =
			`**Usage:** \`remove-track <playlist_name_or_id> <positions>\`\n\n` +
			`Remove specific tracks or ranges from a playlist.\n\n` +
			`**Examples:**\n` +
			`├─ \`remove-track MyFavorites 5\` (removes track 5)\n` +
			`├─ \`remove-track MyFavorites 3,7,10\` (removes 3, 7, 10)\n` +
			`└─ \`remove-track MyFavorites 5-10\` (removes 5 through 10)`;
		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
		);
		return UsageContainer;
	}

	async _reply(context, container) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};
		if (context.replied || context.deferred) return context.editReply(payload);
		return context.reply(payload);
	}
}

export default new RemoveTrackCommand();
