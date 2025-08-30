import {
	Client,
	GatewayIntentBits,
	Events,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	AttachmentBuilder,
} from 'discord.js';
import { inspect } from 'util';
import { createCanvas } from '@napi-rs/canvas';

const AUTHORIZED_USER = '931059762173464597';

class Shikamori {
	constructor() {
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.GuildMembers,
			],
		});

		this.paginationData = new Map();
		this.setupEvents();
	}

	setupEvents() {
		this.client.on(Events.ClientReady, () => {
			console.log(`Shikamori ready as ${this.client.user.tag}`);
		});

		this.client.on(Events.MessageCreate, async message => {
			if (message.author.bot || message.author.id !== AUTHORIZED_USER)
				return;

			const content = message.content.toLowerCase();

			if (message.content.startsWith('eval ')) {
				await this.handleEval(message);
			}

			if (content.startsWith('user') || content.startsWith('userinfo')) {
				await this.handleUser(message);
			}

			if (content.startsWith('role') || content.startsWith('roleinfo')) {
				await this.handleRole(message);
			}

			if (content.startsWith('gradient ')) {
				await this.handleGradient(message);
			}
		});

		this.client.on(Events.InteractionCreate, async interaction => {
			if (
				interaction.isButton() &&
				interaction.user.id === AUTHORIZED_USER
			) {
				await this.handlePagination(interaction);
			}
		});
	}

	async handleEval(message) {
		const code = message.content.slice(5);

		try {
			const AsyncFunction = Object.getPrototypeOf(
				async function () {},
			).constructor;
			const func = new AsyncFunction(
				'client',
				'message',
				`return ${code}`,
			);
			let result = await func(this.client, message);

			const output = inspect(result, { depth: 3, maxStringLength: 2000 });
			const content = `\`\`\`js\n${code}\`\`\`\n\`\`\`js\n${output}\`\`\``;

			await this.sendPaginated(message, content, 'eval');
		} catch (error) {
			const content = `\`\`\`js\n${code}\`\`\`\n\`\`\`js\n${error.message}\`\`\``;
			await this.sendPaginated(message, content, 'eval');
		}
	}

	async handleUser(message) {
		const args = message.content.split(' ');
		let targetUser;

		if (args[1]) {
			const userId = args[1].replace(/[<@!>]/g, '');
			try {
				targetUser = await this.client.users.fetch(userId);
			} catch {
				return message.reply('User not found');
			}
		} else if (message.mentions.users.size > 0) {
			targetUser = message.mentions.users.first();
		} else {
			targetUser = message.author;
		}

		try {
			const userJSON = JSON.stringify(targetUser.toJSON(), null, 2);
			let content = `**User: ${targetUser.tag}**\n\`\`\`json\n${userJSON}\`\`\``;

			if (targetUser.displayAvatarURL()) {
				content += `\n**Avatar:** ${targetUser.displayAvatarURL({
					size: 1024,
				})}`;
			}

			if (targetUser.bannerURL) {
				content += `\n**Banner:** ${targetUser.bannerURL({
					size: 1024,
				})}`;
			}
			if (targetUser.avatarDecorationURL) {
				content += `\n**Avatar Decoration:** ${targetUser.avatarDecorationURL(
					{ size: 1024 },
				)}`;
			}
			if (targetUser.guildTagBadgeURL) {
				content += `\n**Guild Tag Badge:** ${targetUser.guildTagBadgeURL(
					{ size: 1024 },
				)}`;
			}
			if (targetUser.primaryGuild) {
				content += `\n**Guild tag:** ${targetUser.primaryGuild.tag}`;
				content += `\n**Guild id:** ${targetUser.primaryGuild.identityGuildId}`;
			}
			if (targetUser.collectibles) {
				if (targetUser.collectibles.asset) {
					content += `\n**Collectibles Nameplate:** ${targetUser.collectibles.nameplate.asset}`;
				}
			}
			await this.sendPaginated(message, content, 'user');
		} catch (error) {
			await message.reply(`Error: ${error.message}`);
		}
	}

	async handleRole(message) {
		const args = message.content.split(' ');
		const roleId = args[1];

		if (!roleId) {
			return message.reply('Usage: role <roleId>');
		}

		if (!message.guild) {
			return message.reply('This command only works in guilds');
		}

		try {
			const role = await message.guild.roles.fetch(roleId);
			if (!role) {
				return message.reply('Role not found');
			}

			const roleJSON = JSON.stringify(role.toJSON(), null, 2);
			let content = `**Role: ${role.name}**\n\`\`\`json\n${roleJSON}\`\`\``;

			const roleData = role.toJSON();
			const colors = roleData.colors;

			if (
				colors &&
				(colors.primaryColor !== undefined ||
					colors.primaryColor !== null)
			) {
				const canvas = createCanvas(800, 200);
				const ctx = canvas.getContext('2d');

				const availableColors = [];
				if (
					colors.primaryColor !== null &&
					colors.primaryColor !== undefined
				) {
					availableColors.push(colors.primaryColor);
				}
				if (
					colors.secondaryColor !== null &&
					colors.secondaryColor !== undefined
				) {
					availableColors.push(colors.secondaryColor);
				}
				if (
					colors.tertiaryColor !== null &&
					colors.tertiaryColor !== undefined
				) {
					availableColors.push(colors.tertiaryColor);
				}

				if (availableColors.length > 0) {
					if (availableColors.length === 1) {
						const color = this.intToHex(availableColors[0]);
						ctx.fillStyle = color;
						ctx.fillRect(0, 0, 800, 200);

						ctx.fillStyle = this.getContrastColor(color);
						ctx.font = '24px Arial';
						ctx.textAlign = 'center';
						ctx.fillText(`${role.name}`, 400, 100);
						ctx.fillText(`Color: ${color}`, 400, 140);
					} else {
						const gradient = ctx.createLinearGradient(0, 0, 800, 0);

						for (let i = 0; i < availableColors.length; i++) {
							const position = i / (availableColors.length - 1);
							const color = this.intToHex(availableColors[i]);
							gradient.addColorStop(position, color);
						}

						ctx.fillStyle = gradient;
						ctx.fillRect(0, 0, 800, 200);

						ctx.fillStyle = '#FFFFFF';
						ctx.strokeStyle = '#000000';
						ctx.lineWidth = 2;
						ctx.font = '24px Arial';
						ctx.textAlign = 'center';

						ctx.strokeText(`${role.name}`, 400, 80);
						ctx.fillText(`${role.name}`, 400, 80);

						const colorText = availableColors
							.map(c => this.intToHex(c))
							.join(' → ');
						ctx.font = '16px Arial';
						ctx.strokeText(`Colors: ${colorText}`, 400, 120);
						ctx.fillText(`Colors: ${colorText}`, 400, 120);

						ctx.strokeText(
							`Gradient Colors: ${availableColors.length}`,
							400,
							150,
						);
						ctx.fillText(
							`Gradient Colors: ${availableColors.length}`,
							400,
							150,
						);
					}

					const buffer = canvas.toBuffer('image/png');
					const attachment = new AttachmentBuilder(buffer, {
						name: `role-gradient-${roleId}.png`,
					});

					await message.reply({
						content: content,
						files: [attachment],
					});
				} else {
					await this.sendPaginated(message, content, 'role');
				}
			} else {
				await this.sendPaginated(message, content, 'role');
			}
		} catch (error) {
			await message.reply(`Error: ${error.message}`);
		}
	}

	async handleGradient(message) {
		const args = message.content.split(' ');
		const roleId = args[1];

		if (!roleId) {
			return message.reply('Usage: gradient <roleId>');
		}

		if (!message.guild) {
			return message.reply('This command only works in guilds');
		}

		try {
			const role = await message.guild.roles.fetch(roleId);
			if (!role) {
				return message.reply('Role not found');
			}

			const roleData = role.toJSON();
			const colors = roleData.colors;

			if (!colors) {
				return message.reply('This role has no gradient colors');
			}

			const canvas = createCanvas(800, 200);
			const ctx = canvas.getContext('2d');

			const availableColors = [];
			if (
				colors.primaryColor !== null &&
				colors.primaryColor !== undefined
			) {
				availableColors.push(colors.primaryColor);
			}
			if (
				colors.secondaryColor !== null &&
				colors.secondaryColor !== undefined
			) {
				availableColors.push(colors.secondaryColor);
			}
			if (
				colors.tertiaryColor !== null &&
				colors.tertiaryColor !== undefined
			) {
				availableColors.push(colors.tertiaryColor);
			}

			if (availableColors.length === 0) {
				return message.reply('No gradient colors found');
			}

			if (availableColors.length === 1) {
				const color = this.intToHex(availableColors[0]);
				ctx.fillStyle = color;
				ctx.fillRect(0, 0, 800, 200);

				ctx.fillStyle = this.getContrastColor(color);
				ctx.font = '24px Arial';
				ctx.textAlign = 'center';
				ctx.fillText(`${role.name}`, 400, 100);
				ctx.fillText(`Color: ${color}`, 400, 140);
			} else {
				const gradient = ctx.createLinearGradient(0, 0, 800, 0);

				for (let i = 0; i < availableColors.length; i++) {
					const position = i / (availableColors.length - 1);
					const color = this.intToHex(availableColors[i]);
					gradient.addColorStop(position, color);
				}

				ctx.fillStyle = gradient;
				ctx.fillRect(0, 0, 800, 200);

				ctx.fillStyle = '#FFFFFF';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 2;
				ctx.font = '24px Arial';
				ctx.textAlign = 'center';

				ctx.strokeText(`${role.name}`, 400, 80);
				ctx.fillText(`${role.name}`, 400, 80);

				const colorText = availableColors
					.map(c => this.intToHex(c))
					.join(' → ');
				ctx.font = '16px Arial';
				ctx.strokeText(`Colors: ${colorText}`, 400, 120);
				ctx.fillText(`Colors: ${colorText}`, 400, 120);

				ctx.strokeText(
					`Gradient Colors: ${availableColors.length}`,
					400,
					150,
				);
				ctx.fillText(
					`Gradient Colors: ${availableColors.length}`,
					400,
					150,
				);
			}

			const buffer = canvas.toBuffer('image/png');
			const attachment = new AttachmentBuilder(buffer, {
				name: `gradient-${roleId}.png`,
			});

			await message.reply({
				content: `**Gradient for role: ${role.name}**`,
				files: [attachment],
			});
		} catch (error) {
			await message.reply(`Error: ${error.message}`);
		}
	}

	intToHex(color) {
		if (color === null || color === undefined) {
			return '#000000';
		}
		return '#' + color.toString(16).padStart(6, '0').toUpperCase();
	}

	getContrastColor(hexColor) {
		const r = parseInt(hexColor.slice(1, 3), 16);
		const g = parseInt(hexColor.slice(3, 5), 16);
		const b = parseInt(hexColor.slice(5, 7), 16);
		const brightness = (r * 299 + g * 587 + b * 114) / 1000;
		return brightness > 128 ? '#000000' : '#FFFFFF';
	}

	async sendPaginated(message, content, type) {
		const maxLength = 1900;

		if (content.length <= maxLength) {
			return message.reply(content);
		}

		const pages = [];
		const lines = content.split('\n');
		let currentPage = '';
		let inCodeBlock = false;
		let codeBlockType = '';

		for (const line of lines) {
			if (line.startsWith('```')) {
				if (!inCodeBlock) {
					inCodeBlock = true;
					codeBlockType = line.slice(3);
				} else {
					inCodeBlock = false;
				}
			}

			if (currentPage.length + line.length + 1 > maxLength) {
				if (inCodeBlock) {
					currentPage += '\n```';
				}
				pages.push(currentPage);
				currentPage = '';
				if (inCodeBlock) {
					currentPage = '```' + codeBlockType + '\n';
				}
			}

			currentPage += (currentPage ? '\n' : '') + line;
		}

		if (currentPage) {
			pages.push(currentPage);
		}

		const messageId = Date.now().toString();
		this.paginationData.set(messageId, {
			pages,
			currentPage: 0,
			type,
			userId: message.author.id,
		});

		const buttons = this.createPaginationButtons(
			messageId,
			0,
			pages.length,
		);
		const reply = await message.reply({
			content: `${pages[0]}\n\n**Page 1 of ${pages.length}**`,
			components: pages.length > 1 ? [buttons] : [],
		});

		this.paginationData.get(messageId).messageId = reply.id;

		setTimeout(() => {
			this.paginationData.delete(messageId);
		}, 300000);
	}

	createPaginationButtons(dataId, currentPage, totalPages) {
		return new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`${dataId}_first`)
				.setLabel('⏪')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage === 0),
			new ButtonBuilder()
				.setCustomId(`${dataId}_prev`)
				.setLabel('◀️')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage === 0),
			new ButtonBuilder()
				.setCustomId(`${dataId}_next`)
				.setLabel('▶️')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage >= totalPages - 1),
			new ButtonBuilder()
				.setCustomId(`${dataId}_last`)
				.setLabel('⏩')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(currentPage >= totalPages - 1),
		);
	}

	async handlePagination(interaction) {
		const [dataId, action] = interaction.customId.split('_');
		const data = this.paginationData.get(dataId);

		if (!data || data.userId !== interaction.user.id) {
			return interaction.reply({
				content: 'Invalid pagination data',
				ephemeral: true,
			});
		}

		let newPage = data.currentPage;

		switch (action) {
			case 'first':
				newPage = 0;
				break;
			case 'prev':
				newPage = Math.max(0, data.currentPage - 1);
				break;
			case 'next':
				newPage = Math.min(data.pages.length - 1, data.currentPage + 1);
				break;
			case 'last':
				newPage = data.pages.length - 1;
				break;
		}

		if (newPage === data.currentPage) {
			return interaction.deferUpdate();
		}

		data.currentPage = newPage;
		const buttons = this.createPaginationButtons(
			dataId,
			newPage,
			data.pages.length,
		);

		await interaction.update({
			content: `${data.pages[newPage]}\n\n**Page ${newPage + 1} of ${
				data.pages.length
			}**`,
			components: [buttons],
		});
	}

	start(token) {
		this.client.login(token);
	}
}

const shikamori = new Shikamori();
if (process.env.token) {
	try {
		shikamori.start(process.env.token);
	} catch (e) {
		console.log(`${e}`);
	}
} else {
	console.log('token not found');
}

export default shikamori;
