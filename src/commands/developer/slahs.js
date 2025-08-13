import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import {
	ContainerBuilder,
	TextDisplayBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ThumbnailBuilder,
	MessageFlags,
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#structures/classes/Command';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';

class UpdateSlashCommand extends Command {
	constructor() {
		super({
			name: 'updateslash',
			description: 'Registers or updates all slash commands with Discord globally (Owner Only)',
			usage: 'updateslash',
			aliases: ['slashupdate'],
			category: 'developer',
			examples: [
				'updateslash',
				'slashupdate',
			],
			ownerOnly: true,
			enabledSlash: false,
		});
	}

	async execute({ client, message }) {
		const initialContainer = new ContainerBuilder();

		initialContainer.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Scanning Commands`)
		);

		initialContainer.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		initialContainer.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent('**Checking for slash-enabled commands...**'),
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
		);

		const msg = await message.reply({ components: [initialContainer], flags: MessageFlags.IsComponentsV2 });

		try {
			const slashCommandsData = client.commandHandler.getSlashCommandsData();

			if (!slashCommandsData || slashCommandsData.length === 0) {
				const noCommandsContainer = new ContainerBuilder();

				noCommandsContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`### ${emoji.get("info")} No Commands Found`)
				);

				noCommandsContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				noCommandsContainer.addSectionComponents(
					new SectionBuilder()
						.addTextDisplayComponents(
							new TextDisplayBuilder().setContent('**No slash-enabled commands found to register.**'),
						)
						.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
				);

				noCommandsContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				return msg.edit({ components: [noCommandsContainer] });
			}

			const rest = new REST({ version: '10' }).setToken(config.token);

			const currentCommands = await rest.get(Routes.applicationCommands(client.user.id));

			const needsUpdate = this._compareCommands(currentCommands, slashCommandsData);

			if (!needsUpdate) {
				const upToDateContainer = new ContainerBuilder();

				upToDateContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`### ${emoji.get("check")} Commands Up to Date`)
				);

				upToDateContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				upToDateContainer.addSectionComponents(
					new SectionBuilder()
						.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(`**All ${slashCommandsData.length} commands are already registered and up to date.**`),
						)
						.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
				);

				upToDateContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				return msg.edit({ components: [upToDateContainer] });
			}

			const validationContainer = new ContainerBuilder();

			validationContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Validating Commands`)
			);

			validationContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			validationContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`**Found ${slashCommandsData.length} commands - validating...**`),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			await msg.edit({ components: [validationContainer] });

			const nameRegex = /^[\da-z-]{1,32}$/;
			for (const cmdData of slashCommandsData) {
				if (!nameRegex.test(cmdData.name)) {
					const validationErrorMsg = `Validation failed for command name: "${cmdData.name}". Names must be 1-32 characters, all lowercase, and contain no spaces or special characters other than hyphens.`;
					logger.error('UpdateSlash', validationErrorMsg);

					const validationErrorContainer = new ContainerBuilder();

					validationErrorContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} Validation Failed`)
					);

					validationErrorContainer.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
					);

					validationErrorContainer.addSectionComponents(
						new SectionBuilder()
							.addTextDisplayComponents(
								new TextDisplayBuilder().setContent(`**Invalid Command Name: \`${cmdData.name}\`**`),
								new TextDisplayBuilder().setContent(`Names must be 1-32 characters, lowercase, and contain only letters, numbers, and hyphens.`),
							)
							.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
					);

					validationErrorContainer.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
					);

					return msg.edit({ components: [validationErrorContainer] });
				}
			}

			const processingContainer = new ContainerBuilder();

			processingContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Registering Commands`)
			);

			processingContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			processingContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`**Registering ${slashCommandsData.length} commands globally...**`),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			await msg.edit({ components: [processingContainer] });

			await rest.put(
				Routes.applicationCommands(client.user.id),
				{ body: slashCommandsData },
			);

			const successContainer = new ContainerBuilder();

			successContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${emoji.get("check")} Registration Complete`)
			);

			successContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			successContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`**Successfully registered ${slashCommandsData.length} commands globally.**`),
						new TextDisplayBuilder().setContent(`Commands may take up to 1 hour to appear globally.`),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			successContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			await msg.edit({ components: [successContainer] });

			logger.success('UpdateSlash', `Registered ${slashCommandsData.length} commands.`);
		} catch (error) {
			logger.error('UpdateSlash', 'Failed to register slash commands', error);

			const errorContainer = new ContainerBuilder();

			errorContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} Registration Failed`)
			);

			errorContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			errorContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent('**An error occurred while registering commands.**'),
						new TextDisplayBuilder().setContent('Check console logs for more details.'),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			errorContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			await msg.edit({ components: [errorContainer] });
		}
	}

	_compareCommands(currentCommands, newCommands) {
		if (currentCommands.length !== newCommands.length) {
			return true;
		}

		const currentMap = new Map(currentCommands.map(cmd => [cmd.name, cmd]));

		for (const newCmd of newCommands) {
			const existing = currentMap.get(newCmd.name);
			if (!existing || JSON.stringify(existing) !== JSON.stringify(newCmd)) {
				return true;
			}
		}

		return false;
	}
}

export default new UpdateSlashCommand();