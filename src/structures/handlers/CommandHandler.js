import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '#utils/logger';
//demn
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CommandHandler {
	constructor() {
		this.commands = new Map();
		this.aliases = new Map();
		this.slashCommands = new Map();
		this.slashCommandFiles = new Map();
		this.categories = new Map();
		this.commandPaths = new Map();
	}

	async loadCommands(dirPath = '../../commands') {
		logger.info('CommandHandler', 'Loading commands...');
		this.commands.clear();
		this.aliases.clear();
		this.slashCommands.clear();
		this.slashCommandFiles.clear();
		this.categories.clear();
		this.commandPaths.clear();

		const commandsAbsolutePath = path.join(__dirname, dirPath);

		try {
			await this._recursivelyLoadCommands(commandsAbsolutePath);
			this._finalizeSlashCommands();
			logger.success(
				'CommandHandler',
				`Loaded ${this.commands.size} prefix and ${this.slashCommandFiles.size} slash commands.`,
			);
		} catch (error) {
			logger.error('CommandHandler', 'Failed to load commands', error);
		}
	}

	async _recursivelyLoadCommands(dirPath, relativePath = '') {
		try {
			const entries = fs.readdirSync(dirPath, {
				withFileTypes: true,
			});

			const loadPromises = entries.map(async entry => {
				const fullPath = path.join(dirPath, entry.name);
				const currentRelativePath = relativePath
					? path.join(relativePath, entry.name)
					: entry.name;

				if (entry.isDirectory()) {
					await this._recursivelyLoadCommands(
						fullPath,
						currentRelativePath,
					);
				} else if (entry.isFile() && entry.name.endsWith('.js')) {
					const category = relativePath || 'default';

					if (!this.categories.has(category)) {
						this.categories.set(category, []);
					}
					await this._loadCommandFile(fullPath, category);
				}
			});

			await Promise.all(loadPromises);
		} catch (error) {
			logger.error(
				'CommandHandler',
				`Failed to read directory: ${dirPath}`,
				error,
			);
		}
	}

	async _loadCommandFile(filePath, category) {
		try {
			const commandModule = await import(
				`file://${filePath}?v=${Date.now()}`
			);

			if (!commandModule?.default) {
				logger.warn(
					'CommandHandler',
					`Invalid command file: ${path.basename(
						filePath,
					)} is missing a default export.`,
				);
				return;
			}

			const command = commandModule.default;
			command.category = category;

			this.commandPaths.set(command.name, filePath);
			this.commands.set(command.name, command);

			if (command.aliases?.length > 0) {
				command.aliases.forEach(alias =>
					this.aliases.set(alias, command.name),
				);
			}

			if (command.enabledSlash && command.slashData) {
				this.slashCommandFiles.set(
					command.slashData.name.toString(),
					command,
				);
			}

			this.categories.get(category)?.push(command);
			logger.info(
				'CommandHandler',
				`Loaded command file: ${command.name} from category: ${category}`,
			);
		} catch (error) {
			logger.error(
				'CommandHandler',
				`Failed to load command file: ${path.basename(filePath)}`,
				error,
			);
		}
	}

	_finalizeSlashCommands() {
		for (const command of this.slashCommandFiles.values()) {
			const { name, ...restOfSlashData } = command.slashData;

			if (Array.isArray(name)) {
				const [groupName, subCommandName] = name;
				let group = this.slashCommands.get(groupName);

				if (!group) {
					group = {
						name: groupName,
						description:
							restOfSlashData.groupDescription ||
							`${groupName} commands.`,
						options: [],
					};
					this.slashCommands.set(groupName, group);
				}

				group.options.push({
					name: subCommandName,
					description: restOfSlashData.description,
					options: restOfSlashData.options || [],
					type: 1, // SUB_COMMAND
				});
			} else {
				this.slashCommands.set(name, {
					name,
					...restOfSlashData,
				});
			}
		}
	}

	getSlashCommandsData() {
		return Array.from(this.slashCommands.values());
	}

	async reloadAllCommands() {
		logger.info('CommandHandler', 'Reloading all commands...');
		try {
			await this.loadCommands();
			return {
				success: true,
				message: `Reloaded ${this.commands.size} prefix and ${this.slashCommandFiles.size} slash commands.`,
			};
		} catch (error) {
			logger.error(
				'CommandHandler',
				'A critical error occurred while reloading commands.',
				error,
			);
			return {
				success: false,
				message: 'Failed to reload commands.',
			};
		}
	}
}
