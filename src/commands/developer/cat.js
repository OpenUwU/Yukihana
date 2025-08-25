import { Command } from "#structures/classes/Command";
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
} from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, basename } from "path";

const LINES_PER_PAGE = 20;
const MAX_FILE_SIZE = 1024 * 1024;

class CatCommand extends Command {
  constructor() {
    super({
      name: "cat",
      description: "Display file contents with syntax highlighting  (Owner Only)",
      usage: "cat <filepath>",
      aliases: ["view", "show"],
      category: "developer",
      examples: [
        "cat src/commands/info/botinfo.js",
        "cat package.json",
        "cat config/config.js"
      ],
      ownerOnly: true,
    });
  }

  async execute({ client, message, args }) {
    if (!config.ownerIds?.includes(message.author.id)) {
      return this._sendError(message, "Access Denied", "This command is restricted to bot owners only.");
    }

    if (!args.length) {
      const sent = await message.reply({
        components: [this._createHelpContainer()],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true
      });
      return this._setupHelpCollector(sent, message.author.id);
    }

    const filepath = args.join(" ");
    await this._displayFile(message, filepath);
  }

  async _displayFile(message, filepath) {
    try {
      const fullPath = this._resolvePath(filepath);

      if (!existsSync(fullPath)) {
        return this._sendError(message, "File Not Found", `The file \`${filepath}\` does not exist.`);
      }

      const stats = statSync(fullPath);

      if (stats.isDirectory()) {
        return this._sendError(message, "Invalid File", `\`${filepath}\` is a directory, not a file.`);
      }

      if (stats.size > MAX_FILE_SIZE) {
        return this._sendError(message, "File Too Large", `File size (${this._formatFileSize(stats.size)}) exceeds the maximum limit of ${this._formatFileSize(MAX_FILE_SIZE)}.`);
      }

      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const fileInfo = {
        path: filepath,
        name: basename(fullPath),
        extension: extname(fullPath),
        size: stats.size,
        lines: lines.length,
        modified: stats.mtime
      };

      const sent = await message.reply({
        components: [this._createFileContainer(fileInfo, lines, 0)],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true
      });

      this._setupFileCollector(sent, message.author.id, fileInfo, lines);
    } catch (error) {
      logger.error("CatCommand", `Error displaying file: ${error.message}`, error);
      return this._sendError(message, "Read Error", `Failed to read file: \`${error.message}\``);
    }
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("folder")} File Display Tool`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Display file contents with syntax highlighting and pagination**\n\n` +
      `**${emoji.get("check")} Supported Features:**\n` +
      `├─ Syntax highlighting by file extension\n` +
      `├─ Pagination for large files (${LINES_PER_PAGE} lines per page)\n` +
      `├─ Line numbering and file metadata\n` +
      `├─ Maximum file size: ${this._formatFileSize(MAX_FILE_SIZE)}\n` +
      `└─ UTF-8 encoding support\n\n` +
      `**${emoji.get("add")} Usage Examples:**\n` +
      `├─ \`cat src/commands/info/botinfo.js\`\n` +
      `├─ \`cat package.json\`\n` +
      `├─ \`cat config/config.js\`\n` +
      `└─ \`cat README.md\`\n\n` +
      `**${emoji.get("info")} Supported Extensions:**\n` +
      `├─ JavaScript (.js, .mjs, .ts)\n` +
      `├─ JSON (.json)\n` +
      `├─ Markdown (.md)\n` +
      `├─ Configuration (.yml, .yaml, .env)\n` +
      `└─ And many more...`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createFileContainer(fileInfo, lines, page = 0) {
    const container = new ContainerBuilder();
    const totalPages = Math.ceil(lines.length / LINES_PER_PAGE);
    const currentPage = Math.min(page, totalPages - 1);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("folder")} ${fileInfo.name}`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const startLine = currentPage * LINES_PER_PAGE;
    const endLine = Math.min(startLine + LINES_PER_PAGE, lines.length);
    const pageLines = lines.slice(startLine, endLine);

    let content = '';
    if (totalPages > 1) {
      content += `**Page ${currentPage + 1} of ${totalPages}** • `;
    }
    content += `**Lines ${startLine + 1}-${endLine} of ${fileInfo.lines.toLocaleString()}**\n\n`;

    const numberedLines = pageLines.map((line, index) => {
      const lineNumber = (startLine + index + 1).toString().padStart(3, ' ');
      return `${lineNumber}│ ${line}`;
    });

    const language = this._getLanguageFromExtension(fileInfo.extension);
    content += `\`\`\`${language}\n${numberedLines.join('\n')}\n\`\`\``;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
    );
    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = [];

    if (totalPages > 1) {
      if (currentPage > 0) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId("cat_first")
            .setLabel("First")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("reset"))
        );
        buttons.push(
          new ButtonBuilder()
            .setCustomId("cat_prev")
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("cross"))
        );
      }

      if (currentPage < totalPages - 1) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId("cat_next")
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("add"))
        );
        buttons.push(
          new ButtonBuilder()
            .setCustomId("cat_last")
            .setLabel("Last")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("check"))
        );
      }
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId("cat_info")
        .setLabel("File Info")
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji.get("info"))
    );

    if (buttons.length > 0) {
      if (buttons.length <= 5) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
      } else {
        const row1 = buttons.slice(0, 4);
        const row2 = buttons.slice(4);
        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(...row1),
          new ActionRowBuilder().addComponents(...row2)
        );
      }
    }

    return container;
  }

  _createFileInfoContainer(fileInfo) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("info")} File Details`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Detailed file information**\n\n` +
      `**${emoji.get("folder")} File Properties:**\n` +
      `├─ **Name:** ${fileInfo.name}\n` +
      `├─ **Path:** \`${fileInfo.path}\`\n` +
      `├─ **Extension:** ${fileInfo.extension || 'None'}\n` +
      `├─ **Size:** ${this._formatFileSize(fileInfo.size)}\n` +
      `├─ **Lines:** ${fileInfo.lines.toLocaleString()}\n` +
      `└─ **Type:** ${this._getFileType(fileInfo.extension)}\n\n` +
      `**${emoji.get("check")} Timestamps:**\n` +
      `├─ **Modified:** <t:${Math.floor(fileInfo.modified.getTime() / 1000)}:F>\n` +
      `├─ **Relative:** <t:${Math.floor(fileInfo.modified.getTime() / 1000)}:R>\n` +
      `└─ **Date:** ${fileInfo.modified.toLocaleDateString()}\n\n` +
      `**${emoji.get("add")} Display Settings:**\n` +
      `├─ **Lines per Page:** ${LINES_PER_PAGE}\n` +
      `├─ **Total Pages:** ${Math.ceil(fileInfo.lines / LINES_PER_PAGE)}\n` +
      `├─ **Syntax:** ${this._getLanguageFromExtension(fileInfo.extension)}\n` +
      `└─ **Encoding:** UTF-8`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cat_back")
        .setLabel("Back to File")
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji.get("folder"))
    );

    container.addActionRowComponents(buttonRow);

    return container;
  }

  _resolvePath(filepath) {
    if (filepath.startsWith('/') || filepath.includes('..')) {
      throw new Error("Absolute paths and directory traversal are not allowed");
    }
    return join(process.cwd(), filepath);
  }

  _getLanguageFromExtension(ext) {
    const languageMap = {
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.ts': 'typescript',
      '.json': 'json',
      '.md': 'markdown',
      '.py': 'python',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.sql': 'sql',
      '.sh': 'bash',
      '.env': 'bash'
    };
    return languageMap[ext] || 'text';
  }

  _getFileType(ext) {
    const typeMap = {
      '.js': 'JavaScript Module',
      '.mjs': 'ES Module',
      '.ts': 'TypeScript',
      '.json': 'JSON Configuration',
      '.md': 'Markdown Document',
      '.py': 'Python Script',
      '.yml': 'YAML Configuration',
      '.yaml': 'YAML Configuration',
      '.xml': 'XML Document',
      '.html': 'HTML Document',
      '.css': 'CSS Stylesheet',
      '.sql': 'SQL Script',
      '.sh': 'Shell Script',
      '.env': 'Environment Variables'
    };
    return typeMap[ext] || 'Text File';
  }

  _formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
  }

  _setupHelpCollector(message, userId) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("CatCommand", "Help collector error:", error);
      }
    });

    this._setupCollectorEnd(collector, message);
  }

  _setupFileCollector(message, userId, fileInfo, lines) {
    let currentPage = 0;
    const totalPages = Math.ceil(lines.length / LINES_PER_PAGE);

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === "cat_first") {
          currentPage = 0;
          await interaction.editReply({
            components: [this._createFileContainer(fileInfo, lines, currentPage)]
          });
        } else if (interaction.customId === "cat_prev") {
          if (currentPage > 0) {
            currentPage--;
            await interaction.editReply({
              components: [this._createFileContainer(fileInfo, lines, currentPage)]
            });
          }
        } else if (interaction.customId === "cat_next") {
          if (currentPage < totalPages - 1) {
            currentPage++;
            await interaction.editReply({
              components: [this._createFileContainer(fileInfo, lines, currentPage)]
            });
          }
        } else if (interaction.customId === "cat_last") {
          currentPage = totalPages - 1;
          await interaction.editReply({
            components: [this._createFileContainer(fileInfo, lines, currentPage)]
          });
        } else if (interaction.customId === "cat_info") {
          await interaction.editReply({
            components: [this._createFileInfoContainer(fileInfo)]
          });
        } else if (interaction.customId === "cat_back") {
          await interaction.editReply({
            components: [this._createFileContainer(fileInfo, lines, currentPage)]
          });
        }
      } catch (error) {
        logger.error("CatCommand", "File collector error:", error);
      }
    });

    this._setupCollectorEnd(collector, message);
  }

  _setupCollectorEnd(collector, message) {
    collector.on("end", async () => {
      try {
        const fetchedMessage = await message.fetch().catch(() => null);
        if (fetchedMessage?.components.length > 0) {
          const disabledComponents = fetchedMessage.components.map(row => {
            const newRow = ActionRowBuilder.from(row);
            newRow.components.forEach(component => {
              if (component.data.style !== ButtonStyle.Link) {
                component.setDisabled(true);
              }
            });
            return newRow;
          });
          await fetchedMessage.edit({ components: disabledComponents });
        }
      } catch (error) {
        if (error.code !== 10008) {
          logger.error("CatCommand", "Failed to disable components:", error);
        }
      }
    });
  }

  _sendError(message, title, description) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} ${title}`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return message.reply({ 
      components: [container], 
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true 
    });
  }
}

export default new CatCommand();

