import { Command } from "#structures/classes/Command";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	ModalBuilder,
	SectionBuilder,
	SeparatorBuilder,
	TextInputBuilder,
	TextInputStyle,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import {config} from "#config/config"
class EditPlaylistCommand extends Command {
	constructor() {
		super({
			name: "edit-playlist",
			description: "Edit the name or description of a custom playlist",
			usage: "edit-playlist <playlist_id_or_name>",
			aliases: ["edit-pl", "pl-edit"],
			category: "music",
			examples: ["edit-playlist My Favorites", "edit-pl pl_abc123"],
			cooldown: 10,
			enabledSlash: true,
			slashData: {
				name: "edit-playlist",
				description: "Edit a playlist's details",
				options: [
					{
						name: "playlist",
						description: "The ID or name of the playlist to edit",
						type: 3,
						required: true,
					},
				],
			},
		});
	}

	async execute({ client, message, args }) {
		const query = args.join(" ");
		if (!query)
			return message.reply("Please provide a playlist name or ID to edit.");
		return this._handleEdit(message.author, message, query);
	}

	async slashExecute({ client, interaction }) {
		const query = interaction.options.getString("playlist");
		return this._handleEdit(interaction.user, interaction, query);
	}

	async _handleEdit(user, context, query) {
		let playlist = this._findPlaylist(user.id, query);
		if (!playlist) {
			return this._reply(context, this._createNotFoundContainer(query));
		}

		const message = await this._reply(
			context,
			this._buildEditorContainer(playlist),
		);
		if (message) {
			this._setupCollector(message, user.id, playlist.id);
		}
	}

	_buildEditorContainer(playlist, successMessage = null) {
		const container = new ContainerBuilder();
		const shortId = playlist.id.replace("pl_", "").substring(0, 8);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("folder")} **Editing Playlist**`,
			),
		);

		if (successMessage) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`${emoji.get("check")} ${successMessage}`,
				),
			);
		}

		const description = playlist.description
			? `**Description:** ${playlist.description}`
			: "*No description set.*";
		const content = `**Name:** ${playlist.name}\n${description}\n**ID:** \`${shortId}\``;
		container.addSectionComponents(
			new SectionBuilder()
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				)
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
		);

		const buttons = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`editpl_name_${playlist.id}`)
				.setLabel("Edit Name")
				.setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(`editpl_desc_${playlist.id}`)
				.setLabel("Edit Description")
				.setStyle(ButtonStyle.Secondary),
		);
		container.addActionRowComponents(buttons);
		return container;
	}

	_setupCollector(message, userId, playlistId) {
		const filter = (i) =>
			i.user.id === userId && i.customId.startsWith("editpl_");
		const collector = message.createMessageComponentCollector({
			filter,
			time: 300000,
		});

		collector.on("collect", async (interaction) => {
			const [_, type] = interaction.customId.split("_");
			let playlist = db.playlists.getPlaylist(playlistId);
			const modal = new ModalBuilder()
				.setCustomId(`editmodal_${type}_${playlistId}`)
				.setTitle(`Edit Playlist ${type === "name" ? "Name" : "Description"}`);

			if (type === "name") {
				const nameInput = new TextInputBuilder()
					.setCustomId("newName")
					.setLabel("New Playlist Name")
					.setStyle(TextInputStyle.Short)
					.setValue(playlist.name)
					.setMinLength(1)
					.setMaxLength(100)
					.setRequired(true);
				modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
			} else {
				const descInput = new TextInputBuilder()
					.setCustomId("newDesc")
					.setLabel("New Playlist Description")
					.setStyle(TextInputStyle.Paragraph)
					.setValue(playlist.description || "")
					.setMaxLength(500)
					.setRequired(false);
				modal.addComponents(new ActionRowBuilder().addComponents(descInput));
			}

			await interaction.showModal(modal);

			const submitted = await interaction
				.awaitModalSubmit({ time: 60000, filter: (i) => i.user.id === userId })
				.catch(() => null);
			if (!submitted) return;

			await submitted.deferUpdate();

			try {
				const updates = {};
				if (type === "name")
					updates.name = submitted.fields.getTextInputValue("newName");
				if (type === "desc")
					updates.description = submitted.fields.getTextInputValue("newDesc");

				db.playlists.updatePlaylist(playlistId, userId, updates);
				playlist = db.playlists.getPlaylist(playlistId);
				await interaction.editReply({
					components: [
						this._buildEditorContainer(
							playlist,
							"Playlist updated successfully!",
						),
					],
				});
			} catch (error) {
				logger.error("EditPlaylist", "Failed to update playlist", error);
				await interaction.followUp({
					content: `${emoji.get("cross")} Error: ${error.message}`,
					ephemeral: true,
				});
			}
		});

		collector.on("end", async () => {
			try {
				if (message)
					await message.edit({
						components: [this._createExpiredContainer],
						flags: MessageFlags.IsComponentsV2,
					});
			} catch {}
		});
	}
	_createExpiredContainer() {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("info")} **Interaction Expired**`,
			),
		);
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

	_createNotFoundContainer(query) {
		return new ContainerBuilder().addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("cross")} **Playlist Not Found**\nCould not find a playlist matching \`${query}\`.`,
			),
		);
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

export default new EditPlaylistCommand();
