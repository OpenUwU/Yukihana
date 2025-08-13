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
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";
import fs from "fs";
import path from "path";
import { logger } from "#utils/logger";

class HelpCommand extends Command {
  constructor() {
    super({
      name: "help",
      description: "Shows all available commands and their information",
      usage: "help [command]",
      aliases: ["h", "commands"],
      category: "info",
      examples: [
        "help",
        "help play",
        "help music",
        "h skip"
      ],
      cooldown: 3,
      enabledSlash: true,
      slashData: {
        name: "help",
        description: "Get help for commands",
        options: [
          {
            name: "command",
            description: "Specific command to get help for",
            type: 3,
            required: false,
            autocomplete: true,
          },
        ],
      },
    });
  }

  async _scanCommandDirectories() {
    try {
      const commandsPath = path.join(process.cwd(), "src", "commands");
      const commands = new Map();
      const categories = new Map();
      const subcategories = new Map();

      if (!fs.existsSync(commandsPath)) {
        logger.warn("HelpCommand", "Commands directory not found");
        return { commands, categories, subcategories };
      }

      const categoryDirs = fs.readdirSync(commandsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => name !== "developer");

      for (const categoryName of categoryDirs) {
        const categoryPath = path.join(commandsPath, categoryName);

        if (!categories.has(categoryName)) {
          categories.set(categoryName, []);
        }

        await this._scanCategoryDirectory(categoryPath, categoryName, commands, categories, subcategories);
      }

      return { commands, categories, subcategories };
    } catch (error) {
      logger.error("HelpCommand", "Error scanning command directories:", error);
      return { commands: new Map(), categories: new Map(), subcategories: new Map() };
    }
  }

  async _scanCategoryDirectory(categoryPath, categoryName, commands, categories, subcategories) {
    try {
      const items = fs.readdirSync(categoryPath, { withFileTypes: true });

      const commandFiles = items
        .filter(item => item.isFile() && item.name.endsWith('.js'))
        .map(item => item.name);

      for (const file of commandFiles) {
        await this._loadCommand(path.join(categoryPath, file), categoryName, commands, categories);
      }

      const subdirs = items
        .filter(item => item.isDirectory())
        .map(item => item.name);

      if (subdirs.length > 0) {
        if (!subcategories.has(categoryName)) {
          subcategories.set(categoryName, new Map());
        }

        const categorySubcats = subcategories.get(categoryName);

        for (const subdir of subdirs) {
          const subdirPath = path.join(categoryPath, subdir);
          const subcategoryCommands = [];

          const subCommandFiles = fs.readdirSync(subdirPath, { withFileTypes: true })
            .filter(item => item.isFile() && item.name.endsWith('.js'))
            .map(item => item.name);

          for (const file of subCommandFiles) {
            const command = await this._loadCommand(path.join(subdirPath, file), categoryName, commands, categories);
            if (command) {
              subcategoryCommands.push(command);
            }
          }

          if (subcategoryCommands.length > 0) {
            categorySubcats.set(subdir, subcategoryCommands);
          }
        }
      }
    } catch (error) {
      logger.error("HelpCommand", `Error scanning category directory ${categoryName}:`, error);
    }
  }

  async _loadCommand(filePath, categoryName, commands, categories) {
    try {
      const { default: CommandClass } = await import(filePath);

      if (!CommandClass || typeof CommandClass !== 'object') {
        return null;
      }

      const command = {
        ...CommandClass,
        category: categoryName
      };

      commands.set(command.name, command);

      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          commands.set(alias, command);
        }
      }

      const categoryCommands = categories.get(categoryName);
      if (!categoryCommands.find(cmd => cmd.name === command.name)) {
        categoryCommands.push(command);
      }

      return command;
    } catch (error) {
      logger.error("HelpCommand", `Error loading command from ${filePath}:`, error);
      return null;
    }
  }

  async execute({ client, message, args }) {
    try {
      const { commands, categories, subcategories } = await this._scanCommandDirectories();

      if (args.length > 0) {
        const commandName = args[0].toLowerCase();
        const command = commands.get(commandName);

        if (command) {
          return await this._sendCommandHelp(message, command, 'message', client, commands, categories, subcategories);
        } else {
          return message.reply({
            components: [this._createErrorContainer(`Command "${commandName}" not found.`)],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }

      if (categories.size === 0) {
        return message.reply({
          components: [this._createErrorContainer("No commands available.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const helpMessage = await message.reply({
        components: [this._createMainContainer(commands, categories, subcategories)],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(helpMessage, message.author.id, client, commands, categories, subcategories);
    } catch (error) {
      client.logger?.error("HelpCommand", `Error in prefix command: ${error.message}`, error);
      await message.reply({
        components: [this._createErrorContainer("An error occurred while loading help.")],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const { commands, categories, subcategories } = await this._scanCommandDirectories();
      const commandName = interaction.options.getString("command");

      if (commandName) {
        const command = commands.get(commandName.toLowerCase());

        if (command) {
          return await this._sendCommandHelp(interaction, command, 'interaction', client, commands, categories, subcategories);
        } else {
          return interaction.reply({
            components: [this._createErrorContainer(`Command "${commandName}" not found.`)],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true,
          });
        }
      }

      if (categories.size === 0) {
        return interaction.reply({
          components: [this._createErrorContainer("No commands available.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const helpMessage = await interaction.reply({
        components: [this._createMainContainer(commands, categories, subcategories)],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

      this._setupCollector(helpMessage, interaction.user.id, client, commands, categories, subcategories);
    } catch (error) {
      client.logger?.error("HelpCommand", `Error in slash command: ${error.message}`, error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ components: [this._createErrorContainer("An error occurred while loading help.")] });
        } else {
          await interaction.reply({ components: [this._createErrorContainer("An error occurred while loading help.")], ephemeral: true });
        }
      } catch (e) {}
    }
  }

  async autocomplete({ interaction, client }) {
    try {
      const { commands } = await this._scanCommandDirectories();
      const focusedValue = interaction.options.getFocused();

      const uniqueCommands = new Set();
      for (const [name, command] of commands) {
        if (command.name === name) {
          uniqueCommands.add(name);
        }
      }

      const choices = Array.from(uniqueCommands)
        .filter(name => name.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 25)
        .map(name => ({ name, value: name }));

      await interaction.respond(choices);
    } catch (error) {
      await interaction.respond([]).catch(() => {});
    }
  }

  _createMainContainer(commands, categories, subcategories) {
    try {
      const categoryArray = Array.from(categories.keys());
      const uniqueCommands = Array.from(commands.values()).filter((cmd, index, arr) =>
        arr.findIndex(c => c.name === cmd.name) === index
      );
      
      const prefixCommands = uniqueCommands.filter(cmd => !cmd.enabledSlash || !cmd.slashData);
      const slashCommands = uniqueCommands.filter(cmd => cmd.enabledSlash && cmd.slashData);

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Help Menu`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      let content = `${emoji.get("info")} **Total Commands:** ${uniqueCommands.length}\n`;
      content += `${emoji.get("info")} **Prefix Commands:** ${prefixCommands.length}\n`;
      content += `${emoji.get("info")} **Slash Commands:** ${slashCommands.length}\n\n`;
      content += `**Available Categories:**\n`;
      
      categoryArray.forEach(category => {
        content += `${emoji.get("folder")} ${this._capitalize(category)}\n`;
      });

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets?.helpThumbnail || config.assets?.defaultThumbnail)
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      if (categoryArray.length === 0) {
        return this._createErrorContainer("No command categories available.");
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Select a category')
        .addOptions(
          categoryArray.map(category => {
            const categoryCommands = categories.get(category) || [];
            const subcats = subcategories.get(category);
            const subcatCount = subcats ? subcats.size : 0;
            const description = subcatCount > 0 ?
              `${categoryCommands.length} commands, ${subcatCount} subcategories` :
              `${categoryCommands.length} commands`;

            return {
              label: this._capitalize(category),
              value: category,
              description,
            };
          })
        );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(selectMenu)
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating main container:", error);
      return this._createErrorContainer("Unable to load help menu.");
    }
  }

  _createCategoryContainer(category, categories, subcategories) {
    try {
      const commands = categories.get(category) || [];
      const subcats = subcategories.get(category);

      if (commands.length === 0 && (!subcats || subcats.size === 0)) {
        return this._createErrorContainer(`No commands found in category "${category}".`);
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${emoji.get("info")} ${this._capitalize(category)} Commands`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      let content = `${emoji.get("folder")} **${this._capitalize(category)}**\n`;

      if (subcats && subcats.size > 0) {
        for (const [subcatName, subcatCommands] of subcats) {
          content += `${emoji.get("openfolder")} ${this._capitalize(subcatName)}: `;
          const subcatCommandList = subcatCommands.map(cmd => `\`${cmd.name}\``).join(', ');
          content += `${subcatCommandList}\n`;
        }
      }

      const directCommands = commands.filter(cmd => {
        if (!subcats) return true;
        for (const [, subcatCommands] of subcats) {
          if (subcatCommands.find(subcmd => subcmd.name === cmd.name)) {
            return false;
          }
        }
        return true;
      });

      if (directCommands.length > 0) {
        const directCommandList = directCommands.map(cmd => `\`${cmd.name}\``).join(', ');
        if (subcats && subcats.size > 0) {
          content += `Commands: ${directCommandList}`;
        } else {
          content += `Commands: ${directCommandList}`;
        }
      }

      if (!content.trim().includes('Commands') && (!subcats || subcats.size === 0)) {
        content += 'No commands available in this category.';
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets?.helpThumbnail || config.assets?.defaultThumbnail)
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const allCategoryCommands = [...commands];
      if (allCategoryCommands.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`help_command_select_${category}`)
          .setPlaceholder(`${emoji.get("info")} Select a command for detailed info`)
          .addOptions(
            allCategoryCommands.slice(0, 25).map(cmd => ({
              label: cmd.name,
              value: cmd.name,
              description: cmd.description ? cmd.description.slice(0, 100) : 'No description',
            }))
          );

        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(selectMenu)
        );
      }

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help_back_main')
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('help_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
      );

      container.addActionRowComponents(buttonRow);

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating category container:", error);
      return this._createErrorContainer("Unable to load category commands.");
    }
  }

  _createCommandContainer(command, category) {
    try {
      if (!command) {
        return this._createErrorContainer("Command not found.");
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Command: ${command.name}`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      let content = `${emoji.get("info")} **Description:** ${command.description || 'No description provided.'}\n`;
      content += `${emoji.get("info")} **Usage:** \`${command.usage || command.name}\`\n`;
      content += `${emoji.get("info")} **Category:** ${this._capitalize(command.category || 'misc')}\n`;
      content += `${emoji.get("info")} **Cooldown:** ${command.cooldown || 3}s\n`;

      if (command.aliases && command.aliases.length > 0) {
        content += `${emoji.get("info")} **Aliases:** ${command.aliases.map(a => `\`${a}\``).join(', ')}\n`;
      }

      if (command.examples && command.examples.length > 0) {
        content += `${emoji.get("info")} **Examples:**\n`;
        command.examples.forEach(ex => {
          content += `  • \`${ex}\`\n`;
        });
      }

      const requirements = [];
      if (command.ownerOnly) requirements.push('Bot Owner');
      if (command.userPrem) requirements.push('User Premium');
      if (command.guildPrem) requirements.push('Server Premium');
      if (command.anyPrem) requirements.push('Any Premium (User or Server)');
      if (command.voiceRequired) requirements.push('Voice Channel');
      if (command.sameVoiceRequired) requirements.push('Same Voice Channel');
      if (command.playerRequired) requirements.push('Music Player');
      if (command.playingRequired) requirements.push('Currently Playing');
      if (command.maintenance) requirements.push('Maintenance Mode');
      if (command.userPermissions?.length > 0) {
        requirements.push(`User Permissions: ${command.userPermissions.join(', ')}`);
      }
      if (command.permissions?.length > 0) {
        requirements.push(`Bot Permissions: ${command.permissions.join(', ')}`);
      }

      if (requirements.length > 0) {
        content += `${emoji.get("info")} **Requirements:** ${requirements.join(', ')}`;
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets?.helpThumbnail || config.assets?.defaultThumbnail)
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const buttons = [
        new ButtonBuilder()
          .setCustomId(`help_back_category_${category || command.category || 'misc'}`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('help_back_main')
          .setLabel('Home')
          .setStyle(ButtonStyle.Primary)
      ];

      if (command.enabledSlash && command.slashData) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`help_slash_info_${command.name}`)
            .setLabel('Slash Info')
            .setStyle(ButtonStyle.Success)
        );
      }

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(buttons)
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating command container:", error);
      return this._createErrorContainer("Unable to load command information.");
    }
  }

  _createSlashInfoContainer(command, category) {
    try {
      if (!command || !command.slashData) {
        return this._createErrorContainer("Slash command information not available.");
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Slash Command: ${command.name}`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      let slashName;
      if (Array.isArray(command.slashData.name)) {
        slashName = `/${command.slashData.name.join(' ')}`;
      } else {
        slashName = `/${command.slashData.name}`;
      }

      let content = `${emoji.get("info")} **Slash Command:** \`${slashName}\`\n`;
      content += `${emoji.get("info")} **Description:** ${command.slashData.description}\n`;

      if (command.slashData.options && command.slashData.options.length > 0) {
        content += `${emoji.get("info")} **Options:**\n`;
        command.slashData.options.forEach(option => {
          const required = option.required ? ' (Required)' : ' (Optional)';
          content += `  • \`${option.name}\`${required}: ${option.description}\n`;

          if (option.choices && option.choices.length > 0) {
            content += `    Choices: ${option.choices.map(c => `\`${c.name}\``).join(', ')}\n`;
          }
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets?.helpThumbnail || config.assets?.defaultThumbnail)
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`help_back_command_${command.name}_${category || command.category || 'misc'}`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('help_back_main')
          .setLabel('Home')
          .setStyle(ButtonStyle.Primary)
      );

      container.addActionRowComponents(buttonRow);

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating slash info container:", error);
      return this._createErrorContainer("Unable to load slash command information.");
    }
  }

  _createErrorContainer(message) {
    try {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} Error`)
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(message || 'An unknown error occurred.')
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(config.assets?.helpThumbnail || config.assets?.defaultThumbnail)
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating error container:", error);
      const fallbackContainer = new ContainerBuilder();
      fallbackContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} Error\n*Help system unavailable*`)
      );
      return fallbackContainer;
    }
  }

  async _sendCommandHelp(messageOrInteraction, command, type, client, commands, categories, subcategories) {
    try {
      const container = this._createCommandContainer(command, command.category);

      if (type === 'message') {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        this._setupCollector(helpMessage, messageOrInteraction.author.id, client, commands, categories, subcategories);
      } else {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        });
        this._setupCollector(helpMessage, messageOrInteraction.user.id, client, commands, categories, subcategories);
      }
    } catch (error) {
      logger.error("HelpCommand", "Error sending command help:", error);
    }
  }

  _setupCollector(message, userId, client, commands, categories, subcategories) {
    try {
      const filter = (i) => i.user.id === userId;
      const collector = message.createMessageComponentCollector({
        filter,
        time: 300_000
      });

      collector.on('collect', async (interaction) => {
        try {
          await interaction.deferUpdate();

          if (interaction.customId === 'help_close') {
            await interaction.deleteReply();
            collector.stop();
            return;
          }

          if (interaction.customId === 'help_back_main') {
            await interaction.editReply({ components: [this._createMainContainer(commands, categories, subcategories)] });
            return;
          }

          if (interaction.customId === 'help_category_select') {
            const category = interaction.values[0];
            await interaction.editReply({
              components: [this._createCategoryContainer(category, categories, subcategories)]
            });
            return;
          }

          if (interaction.customId.startsWith('help_command_select_')) {
            const category = interaction.customId.replace('help_command_select_', '');
            const commandName = interaction.values[0];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category)]
              });
            }
            return;
          }

          if (interaction.customId.startsWith('help_back_category_')) {
            const category = interaction.customId.replace('help_back_category_', '');
            await interaction.editReply({
              components: [this._createCategoryContainer(category, categories, subcategories)]
            });
            return;
          }

          if (interaction.customId.startsWith('help_slash_info_')) {
            const commandName = interaction.customId.replace('help_slash_info_', '');
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createSlashInfoContainer(command, command.category)]
              });
            }
            return;
          }

          if (interaction.customId.startsWith('help_back_command_')) {
            const parts = interaction.customId.replace('help_back_command_', '').split('_');
            const commandName = parts[0];
            const category = parts[1];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category)]
              });
            }
            return;
          }

        } catch (error) {
          client?.logger?.error("HelpCommand", `Error in collector: ${error.message}`, error);
        }
      });

      collector.on('end', async () => {
        try {
          const fetchedMessage = await message.fetch().catch(() => null);
          if (fetchedMessage?.components.length > 0) {
            const disabledComponents = fetchedMessage.components.map((row) => {
              const newRow = ActionRowBuilder.from(row);
              newRow.components.forEach((component) => {
                if (component.data.style !== ButtonStyle.Link) {
                  component.setDisabled(true);
                }
              });
              return newRow;
            });
            await fetchedMessage.edit({ components: disabledComponents });
          }
        } catch (error) {
          if (error.code !== 10008 && error.code !== 10003) {
            client?.logger?.error("HelpCommand", `Error cleaning up collector: ${error.message}`, error);
          }
        }
      });
    } catch (error) {
      logger.error("HelpCommand", "Error setting up collector:", error);
    }
  }

  _capitalize(str) {
    try {
      if (!str || typeof str !== 'string') {
        return 'Unknown';
      }
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch (error) {
      return 'Unknown';
    }
  }
}

export default new HelpCommand();
