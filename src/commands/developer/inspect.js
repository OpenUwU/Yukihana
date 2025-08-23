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
import { inspect } from "util";

const MAX_OUTPUT_LENGTH = 1900;
const ITEMS_PER_PAGE = 15;

class InspectCommand extends Command {
  constructor() {
    super({
      name: "inspect",
      description: "Deep inspect JavaScript objects and values (Owner Only)",
      usage: "inspect <code>",
      aliases: ["ins", "deep"],
      category: "developer",
      examples: [
        "inspect client.guilds.cache",
        "inspect process.env",
        "inspect this.client.commands"
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
      return this._setupHelpCollector(sent, message.author.id, client);
    }

    const code = args.join(" ");
    await this._inspectCode(client, message, code);
  }

  async _inspectCode(client, message, code) {
    const startTime = process.hrtime.bigint();
    let result, error, type, executionTime;

    try {
      const asyncWrapper = code.includes("await") ? `(async () => { return ${code} })()` : code;
      result = eval(asyncWrapper);
      
      if (result instanceof Promise) {
        result = await result;
      }
      
      type = this._getDetailedType(result);
      executionTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    } catch (err) {
      error = err;
      type = "error";
      executionTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    }

    const sent = await message.reply({
      components: [this._createResultContainer(code, result, error, type, executionTime, 0)],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    });

    this._setupResultCollector(sent, message.author.id, client, code, result, error, type, executionTime);
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Deep Object Inspection`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Advanced JavaScript object inspection tool**\n\n` +
      `**${emoji.get("check")} Available Variables:**\n` +
      `├─ \`client\` - Discord client instance\n` +
      `├─ \`message\` - Current message object\n` +
      `├─ \`guild\` - Current guild object\n` +
      `├─ \`channel\` - Current channel object\n` +
      `├─ \`author\` - Message author object\n` +
      `└─ \`process\` - Node.js process object\n\n` +
      `**${emoji.get("add")} Usage Examples:**\n` +
      `├─ \`inspect client.guilds.cache\`\n` +
      `├─ \`inspect process.memoryUsage()\`\n` +
      `├─ \`inspect Object.getOwnPropertyNames(client)\`\n` +
      `└─ \`inspect this.client.commands.keys()\``;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createResultContainer(code, result, error, type, executionTime, page = 0) {
    const container = new ContainerBuilder();
    const isError = !!error;
    const title = isError ? "Inspection Error" : "Inspection Result";
    const titleEmoji = isError ? emoji.get("cross") : emoji.get("check");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${titleEmoji} ${title}`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let content = `**${emoji.get("folder")} Input Code:**\n\`\`\`javascript\n${this._truncateString(code, 300)}\n\`\`\`\n\n`;
    
    content += `**${emoji.get("info")} Inspection Details:**\n`;
    content += `├─ **Type:** \`${type}\`\n`;
    content += `├─ **Time:** \`${executionTime.toFixed(2)}ms\`\n`;
    content += `├─ **Status:** ${isError ? 'Failed' : 'Success'}\n`;
    content += `└─ **Depth:** ${isError ? 'N/A' : '3 levels'}\n\n`;

    if (isError) {
      content += `**${emoji.get("cross")} Error Details:**\n`;
      content += `├─ **Name:** \`${error.name}\`\n`;
      content += `├─ **Message:** \`${error.message}\`\n`;
      
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(0, 5);
        content += `└─ **Stack:**\n\`\`\`\n${stackLines.join('\n')}\n\`\`\``;
      }
    } else {
      const output = this._deepInspect(result);
      const outputLines = output.split('\n');
      
      if (outputLines.length > ITEMS_PER_PAGE) {
        const startIndex = page * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, outputLines.length);
        const paginatedOutput = outputLines.slice(startIndex, endIndex).join('\n');
        
        content += `**${emoji.get("check")} Output (Lines ${startIndex + 1}-${endIndex} of ${outputLines.length}):**\n`;
        content += `\`\`\`javascript\n${paginatedOutput}\n\`\`\``;
      } else {
        content += `**${emoji.get("check")} Output:**\n`;
        content += `\`\`\`javascript\n${output}\n\`\`\``;
      }
    }

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = [];
    
    if (!isError && result) {
      const outputLines = this._deepInspect(result).split('\n');
      
      if (outputLines.length > ITEMS_PER_PAGE) {
        if (page > 0) {
          buttons.push(
            new ButtonBuilder()
              .setCustomId("inspect_prev")
              .setLabel("Previous")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(emoji.get("reset"))
          );
        }
        
        if ((page + 1) * ITEMS_PER_PAGE < outputLines.length) {
          buttons.push(
            new ButtonBuilder()
              .setCustomId("inspect_next")
              .setLabel("Next")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(emoji.get("add"))
          );
        }
      }
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId("inspect_rerun")
        .setLabel("Re-inspect")
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji.get("reset")),
      new ButtonBuilder()
        .setCustomId("inspect_help")
        .setLabel("Help")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("info"))
    );

    if (buttons.length > 0) {
      if (buttons.length <= 5) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
      } else {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons.slice(0, 5)));
      }
    }

    return container;
  }

  _deepInspect(obj) {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    
    try {
      return inspect(obj, {
        depth: 3,
        colors: false,
        maxArrayLength: 50,
        maxStringLength: 200,
        breakLength: 80,
        compact: false,
        showHidden: false,
        showProxy: true,
        sorted: true,
        getters: true
      });
    } catch (error) {
      return `[InspectionError: ${error.message}]`;
    }
  }

  _getDetailedType(obj) {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    
    const basicType = typeof obj;
    
    if (basicType === 'object') {
      if (Array.isArray(obj)) return `Array(${obj.length})`;
      if (obj instanceof Map) return `Map(${obj.size})`;
      if (obj instanceof Set) return `Set(${obj.size})`;
      if (obj instanceof Date) return 'Date';
      if (obj instanceof RegExp) return 'RegExp';
      if (obj instanceof Error) return `${obj.constructor.name}`;
      return obj.constructor?.name || 'Object';
    }
    
    return basicType;
  }

  _truncateString(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  _setupHelpCollector(message, userId, client) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();
      } catch (error) {
        logger.error("InspectCommand", "Help collector error:", error);
      }
    });

    this._setupCollectorEnd(collector, message);
  }

  _setupResultCollector(message, userId, client, code, result, error, type, executionTime) {
    let currentPage = 0;
    
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === "inspect_prev") {
          if (currentPage > 0) {
            currentPage--;
            await interaction.editReply({
              components: [this._createResultContainer(code, result, error, type, executionTime, currentPage)]
            });
          }
        } else if (interaction.customId === "inspect_next") {
          const outputLines = this._deepInspect(result).split('\n');
          const maxPages = Math.ceil(outputLines.length / ITEMS_PER_PAGE);
          
          if (currentPage < maxPages - 1) {
            currentPage++;
            await interaction.editReply({
              components: [this._createResultContainer(code, result, error, type, executionTime, currentPage)]
            });
          }
        } else if (interaction.customId === "inspect_rerun") {
          await this._inspectCode(client, { 
            reply: async (options) => await interaction.editReply(options),
            author: { id: userId }
          }, code);
        } else if (interaction.customId === "inspect_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()]
          });
          return this._setupHelpCollector(message, userId, client);
        }
      } catch (error) {
        logger.error("InspectCommand", "Result collector error:", error);
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
          logger.error("InspectCommand", "Failed to disable components:", error);
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

export default new InspectCommand();
