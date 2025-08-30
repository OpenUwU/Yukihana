import { Command } from '#structures/classes/Command';
import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageFlags,
	SectionBuilder,
	ThumbnailBuilder,
	SeparatorSpacingSize,
} from 'discord.js';
import { config } from '#config/config';
import emoji from '#config/emoji';
import { logger } from '#utils/logger';
import fs from 'fs';
import { inspect } from 'util';

const ITEMS_PER_PAGE = 10;
const MAX_EMOJI_SIZE = 256 * 1024;

class ApplicationEmojiCommand extends Command {
	constructor() {
		super({
			name: 'appemoji',
			description: 'Manage application emojis (Owner Only)',
			usage: 'appemoji [action] [name] [attachment]',
			aliases: ['ae', 'emoji'],
			category: 'developer',
			examples: [
				'appemoji list',
				'appemoji create myemoji https://example.com/emoji.png',
				'appemoji delete myemoji',
				'appemoji info myemoji',
			],
			ownerOnly: true,
		});
	}

	async execute({ client, message, args }) {
		if (!config.ownerIds?.includes(message.author.id)) {
			return this._sendError(
				message,
				'Access Denied',
				'This command is restricted to bot owners only.',
			);
		}

		const action = args[0]?.toLowerCase();

		if (!action) {
			const sent = await message.reply({
				components: [this._createMainContainer(client)],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});
			return this._setupMainCollector(sent, message.author.id, client);
		}

		switch (action) {
			case 'list':
			case 'l':
				return this._handleList(client, message);
			case 'create':
			case 'add':
			case 'c':
				return this._handleCreate(client, message, args.slice(1));
			case 'delete':
			case 'remove':
			case 'd':
				return this._handleDelete(client, message, args[1]);
			case 'edit':
			case 'rename':
			case 'e':
				return this._handleEdit(client, message, args[1], args[2]);
			case 'info':
			case 'i':
				return this._handleInfo(client, message, args[1]);
			default:
				return this._sendError(
					message,
					'Invalid Action',
					`Unknown action: \`${action}\`. Use \`appemoji\` for help.`,
				);
		}
	}

	async _handleList(client, message) {
		try {
			const emojis = await client.application.emojis.fetch();
			const sent = await message.reply({
				components: [this._createListContainer(emojis, 0)],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});
			this._setupListCollector(sent, message.author.id, client, emojis);
		} catch (error) {
			logger.error(
				'ApplicationEmojiCommand',
				'Failed to fetch emojis:',
				error,
			);
			this._sendError(
				message,
				'Fetch Error',
				`Failed to fetch application emojis: ${error.message}`,
			);
		}
	}

	async _handleCreate(client, message, args) {
		const name = args[0];
		const attachment = args[1] || message.attachments.first()?.url;

		if (!name) {
			return this._sendError(
				message,
				'Missing Name',
				'Please provide an emoji name.\n`appemoji create <name> <url|attachment>`',
			);
		}

		if (!attachment) {
			return this._sendError(
				message,
				'Missing Attachment',
				'Please provide an image URL or attach an image file.',
			);
		}

		try {
			const emoji = await client.application.emojis.create({
				name: name,
				attachment: attachment,
			});

			const sent = await message.reply({
				components: [
					this._createSuccessContainer(
						'Emoji Created',
						`Successfully created emoji **${emoji.name}**`,
						emoji,
					),
				],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});
			this._setupBasicCollector(sent, message.author.id, client);
		} catch (error) {
			logger.error(
				'ApplicationEmojiCommand',
				'Failed to create emoji:',
				error,
			);
			this._sendError(
				message,
				'Creation Error',
				`Failed to create emoji: ${error.message}`,
			);
		}
	}

	async _handleDelete(client, message, name) {
		if (!name) {
			return this._sendError(
				message,
				'Missing Name',
				'Please provide an emoji name to delete.\n`appemoji delete <name>`',
			);
		}

		try {
			const emojis = await client.application.emojis.fetch();
			const emoji = emojis.find(e => e.name === name);

			if (!emoji) {
				return this._sendError(
					message,
					'Emoji Not Found',
					`No emoji found with name **${name}**.`,
				);
			}

			await client.application.emojis.delete(emoji);

			const sent = await message.reply({
				components: [
					this._createSuccessContainer(
						'Emoji Deleted',
						`Successfully deleted emoji **${name}**`,
					),
				],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});
			this._setupBasicCollector(sent, message.author.id, client);
		} catch (error) {
			logger.error(
				'ApplicationEmojiCommand',
				'Failed to delete emoji:',
				error,
			);
			this._sendError(
				message,
				'Deletion Error',
				`Failed to delete emoji: ${error.message}`,
			);
		}
	}

	async _handleEdit(client, message, name, newName) {
		if (!name || !newName) {
			return this._sendError(
				message,
				'Missing Parameters',
				'Please provide both current name and new name.\n`appemoji edit <current_name> <new_name>`',
			);
		}

		try {
			const emojis = await client.application.emojis.fetch();
			const emoji = emojis.find(e => e.name === name);

			if (!emoji) {
				return this._sendError(
					message,
					'Emoji Not Found',
					`No emoji found with name **${name}**.`,
				);
			}

			const updatedEmoji = await client.application.emojis.edit(emoji, {
				name: newName,
			});

			const sent = await message.reply({
				components: [
					this._createSuccessContainer(
						'Emoji Renamed',
						`Successfully renamed **${name}** to **${updatedEmoji.name}**`,
						updatedEmoji,
					),
				],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});
			this._setupBasicCollector(sent, message.author.id, client);
		} catch (error) {
			logger.error(
				'ApplicationEmojiCommand',
				'Failed to edit emoji:',
				error,
			);
			this._sendError(
				message,
				'Edit Error',
				`Failed to edit emoji: ${error.message}`,
			);
		}
	}

	async _handleInfo(client, message, name) {
		if (!name) {
			return this._sendError(
				message,
				'Missing Name',
				'Please provide an emoji name to get info.\n`appemoji info <name>`',
			);
		}

		try {
			const emojis = await client.application.emojis.fetch();
			const emoji = emojis.find(e => e.name === name);

			if (!emoji) {
				return this._sendError(
					message,
					'Emoji Not Found',
					`No emoji found with name **${name}**.`,
				);
			}

			const sent = await message.reply({
				components: [this._createInfoContainer(emoji)],
				flags: MessageFlags.IsComponentsV2,
				fetchReply: true,
			});
			this._setupBasicCollector(sent, message.author.id, client);
		} catch (error) {
			logger.error(
				'ApplicationEmojiCommand',
				'Failed to fetch emoji info:',
				error,
			);
			this._sendError(
				message,
				'Info Error',
				`Failed to get emoji info: ${error.message}`,
			);
		}
	}

	_createMainContainer(client) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${emoji.get('folder')} Application Emoji Manager`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**${emoji.get('info')} Application Emoji Management**\n\n` +
			`**${emoji.get('check')} Available Actions:**\n` +
			`├─ \`list\` - View all application emojis\n` +
			`├─ \`create <name> <url>\` - Create new emoji\n` +
			`├─ \`delete <name>\` - Delete existing emoji\n` +
			`├─ \`edit <name> <new_name>\` - Rename emoji\n` +
			`└─ \`info <name>\` - Get emoji information\n\n` +
			`**${emoji.get('add')} Usage Examples:**\n` +
			`├─ \`appemoji list\`\n` +
			`├─ \`appemoji create myemoji https://example.com/emoji.png\`\n` +
			`├─ \`appemoji delete myemoji\`\n` +
			`├─ \`appemoji edit myemoji newname\`\n` +
			`└─ \`appemoji info myemoji\`\n\n` +
			`**${emoji.get('folder')} Emoji Limits:**\n` +
			`├─ Maximum: 50 application emojis\n` +
			`├─ File size: 256KB max\n` +
			`├─ Formats: PNG, JPG, GIF\n` +
			`└─ Size: 128x128 recommended`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(content),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttons = [
			new ButtonBuilder()
				.setCustomId('ae_list')
				.setLabel('List All')
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get('folder')),
			new ButtonBuilder()
				.setCustomId('ae_stats')
				.setLabel('Statistics')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get('info')),
		];

		container.addActionRowComponents(
			new ActionRowBuilder().addComponents(...buttons),
		);

		return container;
	}

	_createListContainer(emojis, page = 0) {
		const container = new ContainerBuilder();
		const emojiArray = Array.from(emojis.values());
		const totalPages = Math.ceil(emojiArray.length / ITEMS_PER_PAGE);
		const startIndex = page * ITEMS_PER_PAGE;
		const endIndex = Math.min(
			startIndex + ITEMS_PER_PAGE,
			emojiArray.length,
		);
		const pageEmojis = emojiArray.slice(startIndex, endIndex);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${emoji.get('folder')} Application Emojis (${
					emojiArray.length
				}/50)`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		let content = '';

		if (emojiArray.length === 0) {
			content =
				`**${emoji.get('cross')} No Application Emojis**\n\n` +
				`No emojis found in this application.\nUse \`appemoji create <name> <url>\` to add one.`;
		} else {
			content = `**${emoji.get('check')} Emoji List (Page ${
				page + 1
			}/${totalPages}):**\n\n`;

			pageEmojis.forEach((emojiItem, index) => {
				const globalIndex = startIndex + index;
				const isLast =
					globalIndex === pageEmojis.length - 1 &&
					page === totalPages - 1;
				const prefix = isLast ? '└─' : '├─';

				content += `${prefix} <:${emojiItem.name}:${emojiItem.id}> \`${emojiItem.name}\` (${emojiItem.id})\n`;
			});

			content += `\n**${emoji.get('info')} Usage Format:**\n`;
			content += `\`<:emoji_name:emoji_id>\``;
		}

		const section = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(content),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttons = [];

		if (totalPages > 1) {
			if (page > 0) {
				buttons.push(
					new ButtonBuilder()
						.setCustomId('ae_prev')
						.setLabel('Previous')
						.setStyle(ButtonStyle.Secondary)
						.setEmoji(emoji.get('reset')),
				);
			}

			if (page < totalPages - 1) {
				buttons.push(
					new ButtonBuilder()
						.setCustomId('ae_next')
						.setLabel('Next')
						.setStyle(ButtonStyle.Secondary)
						.setEmoji(emoji.get('add')),
				);
			}
		}

		buttons.push(
			new ButtonBuilder()
				.setCustomId('ae_refresh')
				.setLabel('Refresh')
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get('reset')),
			new ButtonBuilder()
				.setCustomId('ae_back')
				.setLabel('Back')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get('folder')),
		);

		if (buttons.length > 0) {
			container.addActionRowComponents(
				new ActionRowBuilder().addComponents(...buttons),
			);
		}

		return container;
	}

	_createInfoContainer(emojiItem) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${emoji.get('info')} Emoji Information`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const createdAt = new Date(emojiItem.createdTimestamp);
		const content =
			`**${emoji.get('check')} Emoji Details:**\n\n` +
			`**${emoji.get('folder')} Basic Information:**\n` +
			`├─ **Name:** \`${emojiItem.name}\`\n` +
			`├─ **ID:** \`${emojiItem.id}\`\n` +
			`├─ **Animated:** ${emojiItem.animated ? 'Yes' : 'No'}\n` +
			`└─ **Created:** ${createdAt.toLocaleDateString()} ${createdAt.toLocaleTimeString()}\n\n` +
			`**${emoji.get('add')} Usage Information:**\n` +
			`├─ **Format:** \`<:${emojiItem.name}:${emojiItem.id}>\`\n` +
			`├─ **URL:** [View Image](${emojiItem.url})\n` +
			`└─ **Preview:** <:${emojiItem.name}:${emojiItem.id}>\n\n` +
			`**${emoji.get('folder')} Technical Details:**\n` +
			`├─ **Application ID:** \`${emojiItem.applicationId}\`\n` +
			`├─ **Managed:** ${emojiItem.managed ? 'Yes' : 'No'}\n` +
			`└─ **Available:** ${emojiItem.available ? 'Yes' : 'No'}`;

		const section = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(content),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(emojiItem.url),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttons = [
			new ButtonBuilder()
				.setCustomId('ae_back')
				.setLabel('Back')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get('folder')),
		];

		container.addActionRowComponents(
			new ActionRowBuilder().addComponents(...buttons),
		);

		return container;
	}

	_createSuccessContainer(title, description, emojiItem = null) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${emoji.get('check')} ${title}`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		let content = `**${emoji.get('check')} Success**\n\n${description}`;

		if (emojiItem) {
			content += `\n\n**${emoji.get('info')} Emoji Details:**\n`;
			content += `├─ **Name:** \`${emojiItem.name}\`\n`;
			content += `├─ **ID:** \`${emojiItem.id}\`\n`;
			content += `├─ **Format:** \`<:${emojiItem.name}:${emojiItem.id}>\`\n`;
			content += `└─ **Preview:** <:${emojiItem.name}:${emojiItem.id}>`;
		}

		const section = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(content),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(
					emojiItem?.url || config.assets.defaultThumbnail,
				),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttons = [
			new ButtonBuilder()
				.setCustomId('ae_back')
				.setLabel('Back')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get('folder')),
		];

		container.addActionRowComponents(
			new ActionRowBuilder().addComponents(...buttons),
		);

		return container;
	}

	async _createStatsContainer(client) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${emoji.get('info')} Application Statistics`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		try {
			const emojis = await client.application.emojis.fetch();
			const animated = emojis.filter(e => e.animated).size;
			const staticEmojis = emojis.size - animated;
			const usage = ((emojis.size / 50) * 100).toFixed(1);

			const content =
				`**${emoji.get('folder')} Application Emoji Statistics**\n\n` +
				`**${emoji.get('check')} General Statistics:**\n` +
				`├─ **Total Emojis:** ${emojis.size}/50\n` +
				`├─ **Usage:** ${usage}%\n` +
				`├─ **Static Emojis:** ${staticEmojis}\n` +
				`├─ **Animated Emojis:** ${animated}\n` +
				`└─ **Available Slots:** ${50 - emojis.size}\n\n` +
				`**${emoji.get('info')} Application Details:**\n` +
				`├─ **Application ID:** \`${client.user.id}\`\n` +
				`├─ **Application Name:** ${client.application.name}\n` +
				`└─ **Bot User:** ${client.user.tag}`;

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						client.application.iconURL() ||
							config.assets.defaultThumbnail,
					),
				);

			container.addSectionComponents(section);
		} catch (error) {
			const content = `**${emoji.get(
				'cross',
			)} Error Loading Statistics**\n\nFailed to load emoji statistics: ${
				error.message
			}`;
			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets.defaultThumbnail,
					),
				);

			container.addSectionComponents(section);
		}

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const buttons = [
			new ButtonBuilder()
				.setCustomId('ae_back')
				.setLabel('Back')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get('folder')),
		];

		container.addActionRowComponents(
			new ActionRowBuilder().addComponents(...buttons),
		);

		return container;
	}

	_setupMainCollector(message, userId, client) {
		const collector = message.createMessageComponentCollector({
			filter: i => i.user.id === userId,
			time: 300_000,
		});

		collector.on('collect', async interaction => {
			try {
				await interaction.deferUpdate();

				if (interaction.customId === 'ae_list') {
					const emojis = await client.application.emojis.fetch();
					await interaction.editReply({
						components: [this._createListContainer(emojis, 0)],
					});
					return this._setupListCollector(
						message,
						userId,
						client,
						emojis,
					);
				} else if (interaction.customId === 'ae_stats') {
					await interaction.editReply({
						components: [await this._createStatsContainer(client)],
					});
					return this._setupBasicCollector(message, userId, client);
				}
			} catch (error) {
				logger.error(
					'ApplicationEmojiCommand',
					'Main collector error:',
					error,
				);
			}
		});

		this._setupCollectorEnd(collector, message);
	}

	_setupListCollector(message, userId, client, emojis) {
		let currentPage = 0;

		const collector = message.createMessageComponentCollector({
			filter: i => i.user.id === userId,
			time: 300_000,
		});

		collector.on('collect', async interaction => {
			try {
				await interaction.deferUpdate();

				if (interaction.customId === 'ae_prev') {
					if (currentPage > 0) {
						currentPage--;
						await interaction.editReply({
							components: [
								this._createListContainer(emojis, currentPage),
							],
						});
					}
				} else if (interaction.customId === 'ae_next') {
					const maxPages = Math.ceil(emojis.size / ITEMS_PER_PAGE);
					if (currentPage < maxPages - 1) {
						currentPage++;
						await interaction.editReply({
							components: [
								this._createListContainer(emojis, currentPage),
							],
						});
					}
				} else if (interaction.customId === 'ae_refresh') {
					const refreshedEmojis =
						await client.application.emojis.fetch();
					await interaction.editReply({
						components: [
							this._createListContainer(
								refreshedEmojis,
								currentPage,
							),
						],
					});
					return this._setupListCollector(
						message,
						userId,
						client,
						refreshedEmojis,
					);
				} else if (interaction.customId === 'ae_back') {
					await interaction.editReply({
						components: [this._createMainContainer(client)],
					});
					return this._setupMainCollector(message, userId, client);
				}
			} catch (error) {
				logger.error(
					'ApplicationEmojiCommand',
					'List collector error:',
					error,
				);
			}
		});

		this._setupCollectorEnd(collector, message);
	}

	_setupBasicCollector(message, userId, client) {
		const collector = message.createMessageComponentCollector({
			filter: i => i.user.id === userId,
			time: 300_000,
		});

		collector.on('collect', async interaction => {
			try {
				await interaction.deferUpdate();

				if (interaction.customId === 'ae_back') {
					await interaction.editReply({
						components: [this._createMainContainer(client)],
					});
					return this._setupMainCollector(message, userId, client);
				}
			} catch (error) {
				logger.error(
					'ApplicationEmojiCommand',
					'Basic collector error:',
					error,
				);
			}
		});

		this._setupCollectorEnd(collector, message);
	}

	_setupCollectorEnd(collector, message) {
		collector.on('end', async () => {
			try {
				const fetchedMessage = await message.fetch().catch(() => null);
				if (fetchedMessage?.components.length > 0) {
					const disabledComponents = fetchedMessage.components.map(
						row => {
							const newRow = ActionRowBuilder.from(row);
							newRow.components.forEach(component => {
								if (component.data.style !== ButtonStyle.Link) {
									component.setDisabled(true);
								}
							});
							return newRow;
						},
					);
					await fetchedMessage.edit({
						components: disabledComponents,
					});
				}
			} catch (error) {
				if (error.code !== 10008) {
					logger.error(
						'ApplicationEmojiCommand',
						'Failed to disable components:',
						error,
					);
				}
			}
		});
	}

	_sendError(message, title, description) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${emoji.get('cross')} ${title}`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(description),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets.defaultThumbnail,
					),
				),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			ephemeral: true,
		});
	}
}

export default new ApplicationEmojiCommand();
