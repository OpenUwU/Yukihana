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
import { PlayerManager } from "#managers/PlayerManager";

class LyricsCommand extends Command {
	constructor() {
		super({
			name: "lyrics",
			description:
				"Get synchronized lyrics for the currently playing song with live timing",
			usage: "lyrics",
			aliases: ["ly", "lyric"],
			category: "music",
			examples: ["lyrics"],
			cooldown: 30,
			voiceRequired: false,
			sameVoiceRequired: false,
			enabledSlash: true,
			slashData: {
				name: ["music", "lyrics"],
				description:
					"Get synchronized lyrics for the currently playing song with live timing",
				options: [],
			},
		});
	}

	async execute({ client, message }) {
		try {
			const player = client.music.getPlayer(message.guild.id);

			if (!player || !player.queue.current) {
				return message.reply({
					components: [
						this._createErrorContainer("No song is currently playing."),
					],
					flags: MessageFlags.IsComponentsV2,
				});
			}

			const loadingMsg = await message.reply({
				components: [this._createLoadingContainer()],
				flags: MessageFlags.IsComponentsV2,
			});

			const lyricsResult = await player.getCurrentLyrics();

			if (!lyricsResult) {
				return loadingMsg.edit({
					components: [
						this._createErrorContainer("No lyrics found for this song."),
					],
					flags: MessageFlags.IsComponentsV2,
				});
			}

			const pm = new PlayerManager(player);

			await this._handleLyricsDisplay(
				loadingMsg,
				lyricsResult,
				pm,
				client,
				message.guild.id,
				message.author.id,
			);
		} catch (error) {
			logger.error(
				"LyricsCommand",
				`Error in prefix command: ${error.message}`,
				error,
			);
			const errorContainer = this._createErrorContainer(
				"An error occurred while fetching lyrics.",
			);
			if (message) {
				await message
					.reply({
						components: [errorContainer],
						flags: MessageFlags.IsComponentsV2,
					})
					.catch(() => {});
			}
		}
	}

	async slashExecute({ client, interaction }) {
		try {
			const player = client.music.getPlayer(interaction.guild.id);

			if (!player || !player.current) {
				return interaction.reply({
					components: [
						this._createErrorContainer("No song is currently playing."),
					],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			}

			await interaction.reply({
				components: [this._createLoadingContainer()],
				flags: MessageFlags.IsComponentsV2,
			});

			const lyricsResult = await player.getCurrentLyrics();

			if (!lyricsResult) {
				return interaction.editReply({
					components: [
						this._createErrorContainer("No lyrics found for this song."),
					],
					flags: MessageFlags.IsComponentsV2,
				});
			}

			const pm = new PlayerManager(player);
			await this._handleLyricsDisplay(
				interaction,
				lyricsResult,
				pm,
				client,
				interaction.guild.id,
				interaction.user.id,
				true,
			);
		} catch (error) {
			logger.error(
				"LyricsCommand",
				`Error in slash command: ${error.message}`,
				error,
			);
			const errorPayload = {
				components: [
					this._createErrorContainer(
						"An error occurred while fetching lyrics.",
					),
				],
				flags: MessageFlags.IsComponentsV2,
				ephemeral: true,
			};
			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.editReply(errorPayload);
				} else {
					await interaction.reply(errorPayload);
				}
			} catch (e) {}
		}
	}

	async _handleLyricsDisplay(
		messageOrInteraction,
		lyricsResult,
		playerManager,
		client,
		guildId,
		userId,
		isInteraction = false,
	) {
		const track = playerManager.currentTrack;
		const hasLines = lyricsResult.lines && lyricsResult.lines.length > 0;
		const isLive =
			hasLines && lyricsResult.lines.some((line) => line.timestamp > 0);

		if (hasLines && isLive) {
			await this._displayLiveLyrics(
				messageOrInteraction,
				lyricsResult,
				playerManager,
				client,
				guildId,
				userId,
				isInteraction,
			);
		} else if (lyricsResult.text) {
			await this._displayStaticLyrics(
				messageOrInteraction,
				lyricsResult,
				track,
				guildId,
				userId,
				isInteraction,
			);
		} else {
			const errorContainer = this._createErrorContainer(
				"Lyrics data is incomplete or unavailable.",
			);
			if (isInteraction) {
				await messageOrInteraction.editReply({ components: [errorContainer] });
			} else {
				await messageOrInteraction.edit({ components: [errorContainer] });
			}
		}
	}

	async _displayLiveLyrics(
		messageOrInteraction,
		lyricsResult,
		playerManager,
		client,
		guildId,
		userId,
		isInteraction = false,
	) {
		const track = playerManager.currentTrack;
		let currentLineIndex = 0;
		let isActive = true;

		const updateLyrics = () => {
			if (!isActive || !playerManager.isPlaying) return;

			const currentPosition = playerManager.position;
			const currentLine = this._getCurrentLine(
				lyricsResult.lines,
				currentPosition,
			);
			const nextLines = this._getUpcomingLines(
				lyricsResult.lines,
				currentPosition,
				8,
			);

			if (currentLine.index !== currentLineIndex) {
				currentLineIndex = currentLine.index;

				const container = this._createLiveLyricsContainer(
					track,
					lyricsResult,
					currentLine.line,
					nextLines,
					currentPosition,
				);

				const updatePromise = isInteraction
					? messageOrInteraction.editReply({ components: [container] })
					: messageOrInteraction.edit({ components: [container] });

				updatePromise.catch((error) => {
					if (error.code !== 10008) {
						logger.error(
							"LyricsCommand",
							`Error updating live lyrics: ${error.message}`,
						);
					}
					isActive = false;
				});
			}
		};

		const initialContainer = this._createLiveLyricsContainer(
			track,
			lyricsResult,
			lyricsResult.lines[0],
			lyricsResult.lines.slice(0, 8),
			playerManager.position,
		);

		if (isInteraction) {
			await messageOrInteraction.editReply({ components: [initialContainer] });
		} else {
			await messageOrInteraction.edit({ components: [initialContainer] });
		}

		const interval = setInterval(updateLyrics, 1000);

		setTimeout(() => {
			isActive = false;
			clearInterval(interval);

			const finalContainer = this._createStaticLyricsContainer(
				track,
				lyricsResult,
				0,
				this._chunkLyrics(
					lyricsResult.text || lyricsResult.lines.map((l) => l.line).join("\n"),
				),
			);

			const finalPromise = isInteraction
				? messageOrInteraction.editReply({ components: [finalContainer] })
				: messageOrInteraction.edit({ components: [finalContainer] });

			finalPromise.catch(() => {});
		}, 300000);
	}

	async _displayStaticLyrics(
		messageOrInteraction,
		lyricsResult,
		track,
		guildId,
		userId,
		isInteraction = false,
	) {
		const lyrics =
			lyricsResult.text || lyricsResult.lines.map((l) => l.line).join("\n");
		const chunks = this._chunkLyrics(lyrics);

		if (chunks.length === 1) {
			const container = this._createStaticLyricsContainer(
				track,
				lyricsResult,
				0,
				chunks,
			);
			if (isInteraction) {
				return messageOrInteraction.editReply({ components: [container] });
			} else {
				return messageOrInteraction.edit({ components: [container] });
			}
		}

		let currentPage = 0;
		const totalPages = chunks.length;

		const getButtons = (page) => {
			return new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`lyrics_prev_${guildId}_${userId}`)
					.setLabel(`${emoji.get("left")} Previous`)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(page === 0),
				new ButtonBuilder()
					.setCustomId(`lyrics_next_${guildId}_${userId}`)
					.setLabel(`Next ${emoji.get("right")}`)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(page === totalPages - 1),
			);
		};

		const initialContainer = this._createStaticLyricsContainer(
			track,
			lyricsResult,
			currentPage,
			chunks,
		);
		initialContainer.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);
		initialContainer.addActionRowComponents(getButtons(currentPage));

		const response = isInteraction
			? await messageOrInteraction.editReply({ components: [initialContainer] })
			: await messageOrInteraction.edit({ components: [initialContainer] });

		const filter = (i) =>
			i.customId.startsWith("lyrics_") &&
			i.customId.includes(`_${guildId}_${userId}`) &&
			i.user.id === userId;

		const collector = response.createMessageComponentCollector({
			filter,
			time: 300000,
		});

		collector.on("collect", async (interaction) => {
			if (interaction.customId.includes("prev")) {
				currentPage = Math.max(0, currentPage - 1);
			} else if (interaction.customId.includes("next")) {
				currentPage = Math.min(totalPages - 1, currentPage + 1);
			}

			const newContainer = this._createStaticLyricsContainer(
				track,
				lyricsResult,
				currentPage,
				chunks,
			);
			newContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);
			newContainer.addActionRowComponents(getButtons(currentPage));

			await interaction.update({ components: [newContainer] });
		});

		collector.on("end", async () => {
			try {
				const finalContainer = this._createStaticLyricsContainer(
					track,
					lyricsResult,
					currentPage,
					chunks,
				);
				await response.edit({ components: [finalContainer] });
			} catch (error) {}
		});
	}

	_getCurrentLine(lines, position) {
		for (let i = lines.length - 1; i >= 0; i--) {
			if (lines[i].timestamp <= position) {
				return { line: lines[i], index: i };
			}
		}
		return { line: lines[0], index: 0 };
	}

	_getUpcomingLines(lines, position, count = 5) {
		const currentIndex = lines.findIndex((line) => line.timestamp > position);
		if (currentIndex === -1) return lines.slice(-count);
		return lines.slice(currentIndex, currentIndex + count);
	}

	_chunkLyrics(lyrics, maxLength = 1800) {
		const chunks = [];
		const lines = lyrics.split("\n");
		let currentChunk = "";

		for (const line of lines) {
			if ((currentChunk + line + "\n").length > maxLength) {
				if (currentChunk.trim()) {
					chunks.push(currentChunk.trim());
				}
				currentChunk = line + "\n";
			} else {
				currentChunk += line + "\n";
			}
		}

		if (currentChunk.trim()) {
			chunks.push(currentChunk.trim());
		}

		return chunks.length > 0 ? chunks : ["No lyrics available"];
	}

	_createLoadingContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("loading")} **Fetching Lyrics**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const section = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					"Searching for synchronized lyrics...",
				),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.searchIcon || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(section);

		return container;
	}

	_createErrorContainer(message) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Lyrics Error**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.errorIcon || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(section);

		return container;
	}

	_createLiveLyricsContainer(
		track,
		lyricsResult,
		currentLine,
		upcomingLines,
		position,
	) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("music")} **Live Lyrics**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const trackSection = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`**${track.info.title}**`),
				new TextDisplayBuilder().setContent(
					`by ${track.info.author || "Unknown"} | ${this._formatDuration(track.info.duration)}`,
				),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					track.info.artworkUrl || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(trackSection);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const timeText = `${this._formatDuration(position)} / ${this._formatDuration(track.info.duration)}`;

		let lyricsContent = `# **${emoji.get("right")} ${currentLine.line}**\n\n`;

		upcomingLines.slice(0, 5).forEach((line) => {
			lyricsContent += `${line.line}\n`;
		});

		const lyricsSection = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(lyricsContent.trim()),
			)
			.setButtonAccessory(
				new ButtonBuilder()
					.setURL("https://github.com/bre4d777/yukihana")
					.setLabel("Github")
					.setStyle(ButtonStyle.Link),
			);

		container.addSectionComponents(lyricsSection);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return container;
	}

	_createStaticLyricsContainer(track, lyricsResult, currentPage, chunks) {
		const container = new ContainerBuilder();
		const totalPages = chunks.length;

		const title =
			totalPages > 1
				? `${emoji.get("music")} **Lyrics** (Page ${currentPage + 1}/${totalPages})`
				: `${emoji.get("music")} **Lyrics**`;

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(title),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const trackSection = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`**${track.info.title}**`),
				new TextDisplayBuilder().setContent(
					`by ${track.info.author || "Unknown"} | ${this._formatDuration(track.info.duration)}`,
				),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					track.info.artworkUrl || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(trackSection);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const lyricsSection = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(chunks[currentPage]),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.lyricsIcon || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(lyricsSection);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const sourceSection = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`Source: ${lyricsResult.sourceName} | Provider: ${lyricsResult.provider}`,
				),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					config.assets?.infoIcon || config.assets?.defaultTrackArtwork,
				),
			);

		container.addSectionComponents(sourceSection);

		return container;
	}

	_createProgressBar(current, total, length = 20) {
		if (!total || total <= 0) return "▒".repeat(length);
		const progress = Math.max(0, Math.min(1, current / total));
		const filledBlocks = Math.round(progress * length);
		const emptyBlocks = length - filledBlocks;
		return "█".repeat(filledBlocks) + "▒".repeat(emptyBlocks);
	}

	_formatDuration(ms) {
		if (!ms || ms < 0) return "Live";
		const seconds = Math.floor((ms / 1000) % 60)
			.toString()
			.padStart(2, "0");
		const minutes = Math.floor((ms / (1000 * 60)) % 60)
			.toString()
			.padStart(2, "0");
		const hours = Math.floor(ms / (1000 * 60 * 60));
		if (hours > 0) return `${hours}:${minutes}:${seconds}`;
		return `${minutes}:${seconds}`;
	}
}

export default new LyricsCommand();
