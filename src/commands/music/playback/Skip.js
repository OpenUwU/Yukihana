import { Command } from "#structures/classes/Command";
import {
	ActionRowBuilder,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	StringSelectMenuBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
	ComponentType,
	ButtonBuilder,
	ButtonStyle,
	UserSelectMenuBuilder,
	RoleSelectMenuBuilder,
	ChannelSelectMenuBuilder,
	MentionableSelectMenuBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

class SkipCommand extends Command {
	constructor() {
		super({
			name: "skip",
			description:
				"Skip the current track or jump to a specific track in the queue",
			usage: "skip [amount]",
			aliases: ["s", "next"],
			category: "music",
			examples: ["skip", "skip 3", "s 5", "next"],
			cooldown: 2,
			voiceRequired: true,
			sameVoiceRequired: true,
			playerRequired: true,
			playingRequired: true,
			enabledSlash: true,
			slashData: {
				name: "skip",
				description: "Skip the current track or multiple tracks",
				options: [
					{
						name: "amount",
						description: "Number of tracks to skip (default: 1).",
						type: 4,
						required: false,
						min_value: 1,
					},
				],
			},
		});
	}

	async execute({ client, message, args, pm }) {
		const amount = args[0] ? parseInt(args[0], 10) : 1;
		if (isNaN(amount) || amount < 1) {
			return this._reply(
				message,
				this._createErrorContainer(
					"Please provide a valid number of tracks to skip.",
				),
			);
		}
		return this._handleSkip(client, message, pm, amount);
	}

	async slashExecute({ client, interaction, pm }) {
		const amount = interaction.options.getInteger("amount") || 1;
		return this._handleSkip(client, interaction, pm, amount);
	}

	async _handleSkip(client, context, pm, amount) {
		const queueSize = pm.queueSize;
		const skippedTrack = pm.currentTrack;

		if (amount > queueSize + 1) {
			return this._reply(
				context,
				this._createErrorContainer(
					`Cannot skip ${amount} tracks. Only ${queueSize} tracks are in the queue.`,
				),
			);
		}

		if (amount > queueSize) {
			await pm.skip();
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`${emoji.get("music")} **Playback Stopped**`,
				),
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			const content =
				`**Track Information**\n\n` +
				`├─ **${emoji.get("check")} Status:** Skipped last track\n` +
				`├─ **${emoji.get("folder")} Queue:** Now empty\n` +
				`├─ **${emoji.get("info")} Track:** ${skippedTrack.info.title}\n` +
				`└─ **${emoji.get("reset")} Action:** Playback stopped\n\n` +
				`*Queue has been emptied*`;

			container.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(content),
					)
					.setThumbnailAccessory(
						new ThumbnailBuilder().setURL(
							skippedTrack.info.artworkUrl || config.assets.defaultTrackArtwork,
						),
					),
			);

			return this._reply(context, container);
		}

		const newCurrentTrack = pm.queue.tracks[amount - 1];
		await pm.skip(amount);

		const container = this._createSuccessContainer(
			skippedTrack,
			newCurrentTrack,
			amount,
		);
		const hasQueue = pm.queueSize > 0;

		if (hasQueue) {
			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);
			container.addActionRowComponents(this._createSkipToMenu(pm));
		}

		const message = await this._reply(context, container);
		if (message && hasQueue) {
			this._setupCollector(message, client, pm.guildId);
		}
	}

	_createSuccessContainer(skipped, current, amount) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("music")} **${amount === 1 ? "Track Skipped" : `Skipped ${amount} Tracks`}**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Skipped Track Information**\n\n` +
			`├─ **${emoji.get("info")} Title:** ${skipped.info.title}\n` +
			`├─ **${emoji.get("folder")} Artist:** ${skipped.info.author || "Unknown"}\n` +
			`├─ **${emoji.get("check")} Duration:** ${this._formatDuration(skipped.info.duration)}\n` +
			`└─ **${emoji.get("reset")} Status:** Successfully skipped\n\n` +
			`*Track has been skipped from queue*`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						skipped.info.artworkUrl || config.assets.defaultTrackArtwork,
					),
				),
		);

		if (current) {
			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			const nowPlayingContent =
				`**Now Playing**\n\n` +
				`├─ **${emoji.get("music")} Title:** ${current.info.title}\n` +
				`├─ **${emoji.get("folder")} Artist:** ${current.info.author || "Unknown"}\n` +
				`├─ **${emoji.get("info")} Duration:** ${this._formatDuration(current.info.duration)}\n` +
				`└─ **${emoji.get("check")} Status:** Currently playing\n\n` +
				`*Now streaming in voice channel*`;

			container.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(nowPlayingContent),
					)
					.setThumbnailAccessory(
						new ThumbnailBuilder().setURL(
							current.info.artworkUrl || config.assets.defaultTrackArtwork,
						),
					),
			);
		}

		return container;
	}

	_createSkipToMenu(pm) {
		const options = pm.queue.tracks.slice(0, 25).map((track, index) => ({
			label: track.info.title.substring(0, 100),
			description: `by ${track.info.author || "Unknown"}`.substring(0, 100),
			value: `${index}`,
		}));

		return new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`skip_to_track_${pm.guildId}`)
				.setPlaceholder("Or skip directly to another track...")
				.addOptions(options),
		);
	}

	async _setupCollector(message, client, guildId) {
		const filter = (i) => i.customId === `skip_to_track_${guildId}`;
		const collector = message.createMessageComponentCollector({
			filter,
			time: 60_000,
			max: 1,
		});

		collector.on("collect", async (interaction) => {
			await interaction.deferUpdate();
			const player = client.music?.getPlayer(guildId);

			if (!player || !player.playing) {
				return interaction.editReply({
					content: "The player is no longer active.",
					components: [],
				});
			}

			const pm = new PlayerManager(player);
			const trackIndex = parseInt(interaction.values[0], 10);

			if (trackIndex >= pm.queueSize) {
				return interaction.editReply({
					content: "This track is no longer in the queue.",
					components: [],
				});
			}

			const targetTrack = pm.queue.tracks[trackIndex];
			await pm.skip(trackIndex + 1);

			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`${emoji.get("music")} **Skipped to Track**`,
				),
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			const content =
				`**Now Playing**\n\n` +
				`├─ **${emoji.get("music")} Title:** ${targetTrack.info.title}\n` +
				`├─ **${emoji.get("folder")} Artist:** ${targetTrack.info.author || "Unknown"}\n` +
				`├─ **${emoji.get("info")} Duration:** ${this._formatDuration(targetTrack.info.duration)}\n` +
				`└─ **${emoji.get("check")} Status:** Successfully skipped to track\n\n` +
				`*Now streaming in voice channel*`;

			container.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(content),
					)
					.setThumbnailAccessory(
						new ThumbnailBuilder().setURL(
							targetTrack.info.artworkUrl || config.assets.defaultTrackArtwork,
						),
					),
			);

			await interaction.editReply({ components: [container], content: "" });
		});

		collector.on("end", async (collected, reason) => {
			if (reason === "limit" || reason === "messageDelete") return;

			try {
				const currentMessage = await this._fetchMessage(message).catch(
					() => null,
				);

				if (!currentMessage?.components?.length) {
					return;
				}

				const success = await this._disableAllComponents(currentMessage);

				if (success) {
					logger.debug(
						"SkipCommand",
						`Components disabled successfully. Reason: ${reason}`,
					);
				}
			} catch (error) {
				this._handleDisableError(error, reason);
			}
		});

		collector.on("dispose", async (interaction) => {
			logger.debug(
				"SkipCommand",
				`Interaction disposed: ${interaction.customId}`,
			);
		});
	}

	async _disableAllComponents(message) {
		try {
			const disabledComponents = this._processComponents(message.components);

			await message.edit({
				components: disabledComponents,
				flags: MessageFlags.IsComponentsV2,
			});

			return true;
		} catch (error) {
			logger.error(
				"SkipCommand",
				`Failed to disable components: ${error.message}`,
				error,
			);
			return false;
		}
	}

	_processComponents(components) {
		return components.map((component) => {
			if (component.type === ComponentType.ActionRow) {
				return {
					...component.toJSON(),
					components: component.components.map((subComponent) => ({
						...subComponent.toJSON(),
						disabled: true,
					})),
				};
			}

			if (component.type === ComponentType.Container) {
				return {
					...component.toJSON(),
					components: this._processComponents(component.components),
				};
			}

			if (component.type === ComponentType.Section) {
				const processedComponent = {
					...component.toJSON(),
					components: this._processComponents(component.components),
				};

				if (
					component.accessory &&
					component.accessory.type === ComponentType.Button
				) {
					processedComponent.accessory = {
						...component.accessory.toJSON(),
						disabled: true,
					};
				}

				return processedComponent;
			}

			return component.toJSON();
		});
	}

	_handleDisableError(error, reason) {
		if (error.code === 10008) {
			logger.debug(
				"SkipCommand",
				`Message was deleted, cannot disable components. Reason: ${reason}`,
			);
		} else if (error.code === 50001) {
			logger.warn(
				"SkipCommand",
				`Missing permissions to edit message. Reason: ${reason}`,
			);
		} else {
			logger.error(
				"SkipCommand",
				`Error disabling components: ${error.message}. Reason: ${reason}`,
				error,
			);
		}
	}

	async _fetchMessage(messageOrInteraction) {
		if (messageOrInteraction.fetchReply) {
			return await messageOrInteraction.fetchReply();
		} else if (messageOrInteraction.fetch) {
			return await messageOrInteraction.fetch();
		} else {
			return messageOrInteraction;
		}
	}

	_shouldDisableComponent(component) {
		const selectMenuTypes = [
			StringSelectMenuBuilder,
			UserSelectMenuBuilder,
			RoleSelectMenuBuilder,
			ChannelSelectMenuBuilder,
			MentionableSelectMenuBuilder,
		];

		if (selectMenuTypes.some((type) => component instanceof type)) {
			return true;
		}

		if (component instanceof ButtonBuilder) {
			return component.data.style !== ButtonStyle.Link;
		}

		return false;
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

	_createErrorContainer(message) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Something went wrong**\n\n` +
			`├─ **${emoji.get("info")} Issue:** ${message}\n` +
			`└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n` +
			`*Please check your input and try again*`;

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

		return container;
	}

	async _reply(context, container) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			fetchReply: true,
		};
		if (context.replied || context.deferred) {
			return context.followUp(payload);
		}
		return context.reply(payload);
	}
}

export default new SkipCommand();