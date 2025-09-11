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
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

const PLAYLISTS_PER_PAGE = 5;

class MyPlaylistsCommand extends Command {
	constructor() {
		super({
			name: "my-playlists",
			description: "View all of your custom playlists",
			usage: "my-playlists [page]",
			aliases: ["my-pl", "playlists"],
			category: "music",
			examples: ["my-playlists", "my-pl 2"],
			cooldown: 5,
			enabledSlash: true,
			slashData: {
				name: "my-playlists",
				description: "View all of your custom playlists",
				options: [
					{
						name: "page",
						description: "The page number to view",
						type: 4, // INTEGER
						required: false,
					},
				],
			},
		});
	}

	async execute({ client, message, args }) {
		const page = args[0] ? parseInt(args[0], 10) : 1;
		return this._handleList(message.author, message, isNaN(page) ? 1 : page);
	}

	async slashExecute({ client, interaction }) {
		const page = interaction.options.getInteger("page") || 1;
		return this._handleList(interaction.user, interaction, page);
	}

	async _handleList(user, context, page) {
		const playlists = db.playlists.getUserPlaylists(user.id);

		if (playlists.length === 0) {
			return this._reply(context, this._createNoPlaylistsContainer());
		}

		const message = await this._reply(
			context,
			this._buildPlaylistsContainer(playlists, page),
		);
		if (message) {
			this._setupCollector(message, user.id, playlists, page);
		}
	}

	_buildPlaylistsContainer(playlists, page) {
		const container = new ContainerBuilder();
		const totalPages = Math.ceil(playlists.length / PLAYLISTS_PER_PAGE) || 1;
		page = Math.max(1, Math.min(page, totalPages));

		const startIdx = (page - 1) * PLAYLISTS_PER_PAGE;
		const pagePlaylists = playlists.slice(
			startIdx,
			startIdx + PLAYLISTS_PER_PAGE,
		);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("folder")} **Your Custom Playlists**`,
			),
		);
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		let content = `**Page ${page} of ${totalPages}** (${playlists.length} total playlists)\n\n`;
		pagePlaylists.forEach((pl, index) => {
			const globalIndex = startIdx + index + 1;
			const shortId = pl.id.replace("pl_", "").substring(0, 8);
			content +=
				`**${globalIndex}. ${pl.name}**\n` +
				`   ├─ ${emoji.get("info")} **ID:** \`${shortId}\`\n` +
				`   ├─ ${emoji.get("music")} **Tracks:** ${pl.track_count}\n` +
				`   └─ ${emoji.get("reset")} **Duration:** ${this._formatDuration(pl.total_duration)}\n`;
		});

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))

				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				),
		);

		if (totalPages > 1) {
			const buttons = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`mypl_prev_${page}`)
					.setLabel("Previous")
					.setStyle(ButtonStyle.Secondary)
					.setEmoji(emoji.get("left"))
					.setDisabled(page <= 1),
				new ButtonBuilder()
					.setCustomId(`mypl_next_${page}`)
					.setLabel("Next")
					.setStyle(ButtonStyle.Secondary)
					.setEmoji(emoji.get("right"))
					.setDisabled(page >= totalPages),
			);
			container.addActionRowComponents(buttons);
		}

		return container;
	}

	_setupCollector(message, userId, playlists, initialPage) {
		const filter = (i) =>
			i.user.id === userId && i.customId.startsWith("mypl_");
		const collector = message.createMessageComponentCollector({
			filter,
			time: 300000,
		});
		let currentPage = initialPage;

		collector.on("collect", async (interaction) => {
			await interaction.deferUpdate();
			const [_, action, pageStr] = interaction.customId.split("_");
			const page = parseInt(pageStr, 10);

			if (action === "prev") currentPage = page - 1;
			if (action === "next") currentPage = page + 1;

			await interaction.editReply({
				components: [this._buildPlaylistsContainer(playlists, currentPage)],
			});
		});

		collector.on("end", async () => {
			try {
				if (message)
					await message.edit({
						components: [this._createExpiredContainer],
						flags: MessageFlags.IsComponentsV2,
					});
			} catch (error) {
				if (error.code !== 10008)
					logger.error(
						"MyPlaylists",
						"Failed to clear components on end",
						error,
					);
			}
		});
	}

	_createExpiredContainer() {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Interaction Expired**`,
			),
		);
	}
	_createNoPlaylistsContainer() {
		return new ContainerBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`${emoji.get("info")} **No Playlists Found**`,
				),
			)
			.addSeparatorComponents(new SeparatorBuilder())
			.addSectionComponents(
				new SectionBuilder().addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						`You don't have any custom playlists yet.\n\nUse \`/create-playlist <name>\` to get started!`,
					),
				),
			);
	}

	_formatDuration(ms) {
		if (!ms || ms < 0) return "0:00";
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0)
			return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
}

export default new MyPlaylistsCommand();
