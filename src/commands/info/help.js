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
  ComponentType,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
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
      examples: ["help", "help play", "help music", "h skip"],
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

      const categoryDirs = fs
        .readdirSync(commandsPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .filter((name) => name !== "developer");

      for (const categoryName of categoryDirs) {
        const categoryPath = path.join(commandsPath, categoryName);

        if (!categories.has(categoryName)) {
          categories.set(categoryName, []);
        }

        await this._scanCategoryDirectory(
          categoryPath,
          categoryName,
          commands,
          categories,
          subcategories,
        );
      }

      return { commands, categories, subcategories };
    } catch (error) {
      logger.error("HelpCommand", "Error scanning command directories:", error);
      return {
        commands: new Map(),
        categories: new Map(),
        subcategories: new Map(),
      };
    }
  }

  async _scanCategoryDirectory(
    categoryPath,
    categoryName,
    commands,
    categories,
    subcategories,
  ) {
    try {
      const items = fs.readdirSync(categoryPath, { withFileTypes: true });

      const commandFiles = items
        .filter((item) => item.isFile() && item.name.endsWith(".js"))
        .map((item) => item.name);

      for (const file of commandFiles) {
        await this._loadCommand(
          path.join(categoryPath, file),
          categoryName,
          commands,
          categories,
        );
      }

      const subdirs = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      if (subdirs.length > 0) {
        if (!subcategories.has(categoryName)) {
          subcategories.set(categoryName, new Map());
        }

        const categorySubcats = subcategories.get(categoryName);

        for (const subdir of subdirs) {
          const subdirPath = path.join(categoryPath, subdir);
          const subcategoryCommands = [];

          const subCommandFiles = fs
            .readdirSync(subdirPath, { withFileTypes: true })
            .filter((item) => item.isFile() && item.name.endsWith(".js"))
            .map((item) => item.name);

          for (const file of subCommandFiles) {
            const command = await this._loadCommand(
              path.join(subdirPath, file),
              categoryName,
              commands,
              categories,
            );
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
      logger.error(
        "HelpCommand",
        `Error scanning category directory ${categoryName}:`,
        error,
      );
    }
  }

  async _loadCommand(filePath, categoryName, commands, categories) {
    try {
      const { default: CommandClass } = await import(filePath);

      if (!CommandClass || typeof CommandClass !== "object") {
        return null;
      }

      const command = {
        ...CommandClass,
        category: categoryName,
      };

      commands.set(command.name, command);

      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          commands.set(alias, command);
        }
      }

      const categoryCommands = categories.get(categoryName);
      if (!categoryCommands.find((cmd) => cmd.name === command.name)) {
        categoryCommands.push(command);
      }

      return command;
    } catch (error) {
      logger.error(
        "HelpCommand",
        `Error loading command from ${filePath}:`,
        error,
      );
      return null;
    }
  }

  async execute({ client, message, args }) {
    try {
      const { commands, categories, subcategories } =
        await this._scanCommandDirectories();

      if (args.length > 0) {
        const commandName = args[0].toLowerCase();
        const command = commands.get(commandName);

        if (command) {
          return await this._sendCommandHelp(
            message,
            command,
            "message",
            client,
            commands,
            categories,
            subcategories,
          );
        } else {
          return message.reply({
            components: [
              this._createErrorContainer(`Command "${commandName}" not found.`),
            ],
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
        components: [
          this._createMainContainer(commands, categories, subcategories),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(
        helpMessage,
        message.author.id,
        client,
        commands,
        categories,
        subcategories,
      );
    } catch (error) {
      client.logger?.error(
        "HelpCommand",
        `Error in prefix command: ${error.message}`,
        error,
      );
      await message
        .reply({
          components: [
            this._createErrorContainer("An error occurred while loading help."),
          ],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const { commands, categories, subcategories } =
        await this._scanCommandDirectories();
      const commandName = interaction.options.getString("command");

      if (commandName) {
        const command = commands.get(commandName.toLowerCase());

        if (command) {
          return await this._sendCommandHelp(
            interaction,
            command,
            "interaction",
            client,
            commands,
            categories,
            subcategories,
          );
        } else {
          return interaction.reply({
            components: [
              this._createErrorContainer(`Command "${commandName}" not found.`),
            ],
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
        components: [
          this._createMainContainer(commands, categories, subcategories),
        ],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });

      this._setupCollector(
        helpMessage,
        interaction.user.id,
        client,
        commands,
        categories,
        subcategories,
      );
    } catch (error) {
      client.logger?.error(
        "HelpCommand",
        `Error in slash command: ${error.message}`,
        error,
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            components: [
              this._createErrorContainer(
                "An error occurred while loading help.",
              ),
            ],
          });
        } else {
          await interaction.reply({
            components: [
              this._createErrorContainer(
                "An error occurred while loading help.",
              ),
            ],
            ephemeral: true,
          });
        }
      } catch (e) {
        logger.error("HelpCommand", "Failed to send error response:", e);
      }
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
        .filter((name) =>
          name.toLowerCase().includes(focusedValue.toLowerCase()),
        )
        .slice(0, 25)
        .map((name) => ({ name, value: name }));

      await interaction.respond(choices);
    } catch (error) {
      await interaction.respond([]).catch(() => {});
    }
  }

  _createMainContainer(commands, categories, subcategories) {
    try {
      const categoryArray = Array.from(categories.keys());
      const uniqueCommands = Array.from(commands.values()).filter(
        (cmd, index, arr) =>
          arr.findIndex((c) => c.name === cmd.name) === index,
      );

      const slashCommands = uniqueCommands.filter(
        (cmd) => cmd.enabledSlash && cmd.slashData,
      );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Help Menu**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**Bot Command Information**\n\n`;
      content += `┌─ **${emoji.get("info")} Statistics**\n`;
      content += `├─ Prefix Commands: ${uniqueCommands.length}\n`;
      content += `├─ Slash Commands: ${slashCommands.length}\n`;
      content += `└─ Categories: ${categoryArray.length}\n\n`;

      content += `**Available Categories:**\n`;

      categoryArray.forEach((category, index) => {
        const isLast = index === categoryArray.length - 1;
        const prefix = isLast ? "└─" : "├─";
        const categoryCommands = categories.get(category) || [];
        const subcats = subcategories.get(category);
        const subcatCount = subcats ? subcats.size : 0;
        const info = subcatCount > 0 
          ? `${categoryCommands.length} commands, ${subcatCount} subcategories`
          : `${categoryCommands.length} commands`;

        content += `${prefix} **${emoji.get("folder")} ${this._capitalize(category)}** (${info})\n`;
      });

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (categoryArray.length === 0) {
        return this._createErrorContainer("No command categories available.");
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("help_category_select")
        .setPlaceholder("Select a category")
        .addOptions(
          categoryArray.map((category) => {
            const categoryCommands = categories.get(category) || [];
            const subcats = subcategories.get(category);
            const subcatCount = subcats ? subcats.size : 0;
            const description =
              subcatCount > 0
                ? `${categoryCommands.length} commands, ${subcatCount} subcategories`
                : `${categoryCommands.length} commands`;

            return {
              label: this._capitalize(category),
              value: category,
              emoji: emoji.get("folder"),
              description,
            };
          }),
        );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(selectMenu),
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
        return this._createErrorContainer(
          `No commands found in category "${category}".`,
        );
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **${this._capitalize(category)} Commands**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**${this._capitalize(category)} Category**\n\n`;

  
      const directCommands = commands.filter((cmd) => {
        if (!subcats) return true;
        for (const [, subcatCommands] of subcats) {
          if (subcatCommands.find((subcmd) => subcmd.name === cmd.name)) {
            return false;
          }
        }
        return true;
      });

    
      const hasDirectCommands = directCommands.length > 0;
      const hasSubcats = subcats && subcats.size > 0;
      const subcatEntries = hasSubcats ? Array.from(subcats.entries()) : [];

      
      if (hasDirectCommands) {
        directCommands.forEach((cmd, index) => {
          const isLastDirect = index === directCommands.length - 1;
          const isLastOverall = isLastDirect && !hasSubcats;
          const prefix = isLastOverall ? "└─" : "├─";
          content += `${prefix} \`${cmd.name}\` - ${cmd.description?.slice(0, 50) || "No description"}${cmd.description?.length > 50 ? "..." : ""}\n`;
        });
      }

      
      if (hasSubcats) {
        subcatEntries.forEach(([subcatName, subcatCommands], subcatIndex) => {
          const isLastSubcat = subcatIndex === subcatEntries.length - 1;
          const subcatPrefix = isLastSubcat ? "└─" : "├─";
          const cmdPrefix = isLastSubcat ? "   " : "│  ";

          content += `${subcatPrefix} ${emoji.get("openfolder")} **${this._capitalize(subcatName)}**\n`;

          subcatCommands.forEach((cmd, cmdIndex) => {
            const isLastCmd = cmdIndex === subcatCommands.length - 1;
            const cmdSymbol = isLastCmd ? "└─" : "├─";
            content += `${cmdPrefix}${cmdSymbol} \`${cmd.name}\` - ${cmd.description?.slice(0, 40) || "No description"}${cmd.description?.length > 40 ? "..." : ""}\n`;
          });
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const allCategoryCommands = [...commands];
      if (allCategoryCommands.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`help_command_select_${category}`)
          .setPlaceholder(`Select a command for detailed info`)
          .addOptions(
            allCategoryCommands.slice(0, 25).map((cmd) => ({
              label: cmd.name,
              emoji: emoji.get("info"),
              value: cmd.name,
              description: cmd.description
                ? cmd.description.slice(0, 100)
                : "No description",
            })),
          );

        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(selectMenu),
        );
      }

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help_close")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger),
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
      if (!command) return this._createErrorContainer("Command not found.");

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Command: ${command.name}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**Command Information**\n\n`;
      content += `┌─ **${emoji.get("info")} Basic Info**\n`;
      content += `├─ Description: ${command.description || "No description provided"}\n`;
      content += `├─ Usage: \`${command.usage || command.name}\`\n`;
      content += `├─ Category: ${this._capitalize(command.category || "misc")}\n`;
      content += `└─ Cooldown: ${command.cooldown || 3}s\n\n`;

      if (command.aliases?.length) {
        content += `**Aliases:**\n`;
        command.aliases.forEach((a, i) => {
          const isLast = i === command.aliases.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} \`${a}\`\n`;
        });
        content += "\n";
      }

      if (command.examples?.length) {
        content += `**Examples:**\n`;
        command.examples.forEach((ex, i) => {
          const isLast = i === command.examples.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} \`${ex}\`\n`;
        });
        content += "\n";
      }

      const requirements = [];
      if (command.ownerOnly) requirements.push("Bot Owner");
      if (command.userPrem) requirements.push("User Premium");
      if (command.guildPrem) requirements.push("Server Premium");
      if (command.anyPrem) requirements.push("Any Premium (User or Server)");
      if (command.voiceRequired) requirements.push("Voice Channel");
      if (command.sameVoiceRequired) requirements.push("Same Voice Channel");
      if (command.playerRequired) requirements.push("Music Player");
      if (command.playingRequired) requirements.push("Currently Playing");
      if (command.maintenance) requirements.push("Maintenance Mode");
      if (command.userPermissions?.length)
        requirements.push(
          `User Permissions: ${command.userPermissions.join(", ")}`,
        );
      if (command.permissions?.length)
        requirements.push(`Bot Permissions: ${command.permissions.join(", ")}`);

      if (requirements.length) {
        content += `**Requirements:**\n`;
        requirements.forEach((req, i) => {
          const isLast = i === requirements.length - 1;
          const prefix = isLast ? "└─" : "├─";
          content += `${prefix} ${req}\n`;
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const buttons = [
        new ButtonBuilder()
          .setCustomId(
            `help_back_category_${category || command.category || "misc"}`,
          )
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setLabel("Home")
          .setStyle(ButtonStyle.Primary),
      ];

      if (command.enabledSlash && command.slashData) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`help_slash_info_${command.name}`)
            .setLabel("Slash Info")
            .setStyle(ButtonStyle.Success),
        );
      }

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(buttons),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating command container:", error);
      return this._createErrorContainer("Unable to load command information.");
    }
  }

  _createSlashInfoContainer(command, category) {
    try {
      if (!command?.slashData)
        return this._createErrorContainer(
          "Slash command information not available.",
        );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **Slash Command: ${command.name}**`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const slashName = Array.isArray(command.slashData.name)
        ? `/${command.slashData.name.join(" ")}`
        : `/${command.slashData.name}`;

      let content = `**Slash Command Information**\n\n`;
      content += `┌─ **Command:** \`${slashName}\`\n`;
      content += `└─ **Description:** ${command.slashData.description}\n\n`;

      if (command.slashData.options?.length) {
        content += `**Options:**\n`;
        command.slashData.options.forEach((option, i) => {
          const required = option.required ? " (Required)" : " (Optional)";
          const isLast = i === command.slashData.options.length - 1;
          const prefix = isLast ? "└─" : "├─";
          const indent = isLast ? "   " : "│  ";
          content += `${prefix} \`${option.name}\`${required}: ${option.description}\n`;

          if (option.choices?.length) {
            option.choices.forEach((choice, ci) => {
              const isChoiceLast = ci === option.choices.length - 1;
              const choicePrefix = isChoiceLast ? `${indent}└─` : `${indent}├─`;
              content += `${choicePrefix} \`${choice.name}\`\n`;
            });
          }
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `help_back_command_${command.name}_${category || command.category || "misc"}`,
            )
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("help_back_main")
            .setLabel("Home")
            .setStyle(ButtonStyle.Primary),
        ),
      );

      return container;
    } catch (error) {
      logger.error(
        "HelpCommand",
        "Error creating slash info container:",
        error,
      );
      return this._createErrorContainer(
        "Unable to load slash command information.",
      );
    }
  }

  _createErrorContainer(message) {
    try {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const content = `**Something went wrong**\n\n┌─ **${emoji.get("info")} Issue:** ${message}\n└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n*Please check your input and try again*`;

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      return container;
    } catch (error) {
      logger.error("HelpCommand", "Error creating error container:", error);
      const fallbackContainer = new ContainerBuilder();
      fallbackContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("cross")} **Error**\n*Help system unavailable*`,
        ),
      );
      return fallbackContainer;
    }
  }

  async _sendCommandHelp(
    messageOrInteraction,
    command,
    type,
    client,
    commands,
    categories,
    subcategories,
  ) {
    try {
      const container = this._createCommandContainer(command, command.category);

      if (type === "message") {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.author.id,
          client,
          commands,
          categories,
          subcategories,
        );
      } else {
        const helpMessage = await messageOrInteraction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.user.id,
          client,
          commands,
          categories,
          subcategories,
        );
      }
    } catch (error) {
      logger.error("HelpCommand", "Error sending command help:", error);
    }
  }

  _setupCollector(
    message,
    userId,
    client,
    commands,
    categories,
    subcategories,
  ) {
    try {
      const filter = (i) => i.user.id === userId;
      const collector = message.createMessageComponentCollector({
        filter,
        time: 300_000,
      });

      collector.on("collect", async (interaction) => {
        try {
          await interaction.deferUpdate();

          if (interaction.customId === "help_close") {
            await interaction.deleteReply().catch(() => {});
            collector.stop();
            return;
          }

          if (interaction.customId === "help_back_main") {
            await interaction.editReply({
              components: [
                this._createMainContainer(commands, categories, subcategories),
              ],
            });
            return;
          }

          if (interaction.customId === "help_category_select") {
            const category = interaction.values[0];
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_command_select_")) {
            const category = interaction.customId.replace(
              "help_command_select_",
              "",
            );
            const commandName = interaction.values[0];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category)],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_back_category_")) {
            const category = interaction.customId.replace(
              "help_back_category_",
              "",
            );
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_slash_info_")) {
            const commandName = interaction.customId.replace(
              "help_slash_info_",
              "",
            );
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [
                  this._createSlashInfoContainer(command, command.category),
                ],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_back_command_")) {
            const parts = interaction.customId
              .replace("help_back_command_", "")
              .split("_");
            const commandName = parts[0];
            const category = parts[1];
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [this._createCommandContainer(command, category)],
              });
            }
            return;
          }
        } catch (error) {
          client?.logger?.error(
            "HelpCommand",
            `Error in collector: ${error.message}`,
            error,
          );

          try {
            await interaction.followUp({
              content: "An error occurred while processing your request. Please try again.",
              ephemeral: true,
            });
          } catch (followUpError) {
            client?.logger?.error(
              "HelpCommand",
              `Error sending followup: ${followUpError.message}`,
            );
          }
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "limit" || reason === "messageDelete") return;

        try {
          const currentMessage = await this._fetchMessage(message).catch(
            () => null,
          );

          if (!currentMessage?.components?.length) {
            client?.logger?.debug(
              "HelpCommand",
              "No message or components found for disabling",
            );
            return;
          }

          const success = await this._disableAllComponents(
            currentMessage,
            client,
          );

          if (success) {
            client?.logger?.debug(
              "HelpCommand",
              `Components disabled successfully. Reason: ${reason}`,
            );
          }
        } catch (error) {
          this._handleDisableError(error, client, reason);
        }
      });

      collector.on("dispose", async (interaction) => {
        client?.logger?.debug(
          "HelpCommand",
          `Interaction disposed: ${interaction.customId}`,
        );
      });
    } catch (error) {
      logger.error("HelpCommand", "Error setting up collector:", error);
    }
  }

  async _disableAllComponents(message, client) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error) {
      client?.logger?.error(
        "HelpCommand",
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

  _handleDisableError(error, client, reason) {
    if (error.code === 10008) {
      // Unknown Message
      client?.logger?.debug(
        "HelpCommand",
        `Message was deleted, cannot disable components. Reason: ${reason}`,
      );
    } else if (error.code === 50001) {
      // Missing Access
      client?.logger?.warn(
        "HelpCommand",
        `Missing permissions to edit message. Reason: ${reason}`,
      );
    } else {
      client?.logger?.error(
        "HelpCommand",
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

  _capitalize(str) {
    try {
      if (!str || typeof str !== "string") {
        return "Unknown";
      }
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch (error) {
      return "Unknown";
    }
  }
}

export default new HelpCommand();