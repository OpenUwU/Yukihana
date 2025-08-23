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

class EvalCommand extends Command {
  constructor() {
    super({
      name: "eval",
      description: "Evaluate JavaScript code (Owner Only)",
      usage: "eval <code>",
      aliases: ["e", "evaluate"],
      category: "developer",
      examples: [
        "eval client.guilds.cache.size",
        "eval process.uptime()",
        "eval this.client.users.cache.get('123456789')"
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
    await this._evaluateCode(client, message, code);
  }

  async _evaluateCode(client, message, code) {
    const startTime = process.hrtime.bigint();
    let result, error, type, executionTime;

    try {
      const asyncWrapper = code.includes("await") ? `(async () => { ${code} })()` : code;
      result = eval(asyncWrapper);
      
      if (result instanceof Promise) {
        result = await result;
      }
      
      type = typeof result;
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
      new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Code Evaluation`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**JavaScript code evaluation tool for bot development**\n\n` +
      `**${emoji.get("check")} Available Variables:**\n` +
      `├─ \`client\` - Discord client instance\n` +
      `├─ \`message\` - Current message object\n` +
      `├─ \`guild\` - Current guild object\n` +
      `├─ \`channel\` - Current channel object\n` +
      `├─ \`author\` - Message author object\n` +
      `└─ \`process\` - Node.js process object\n\n` +
      `**${emoji.get("folder")} Supported Features:**\n` +
      `├─ Async/await support\n` +
      `├─ Promise handling\n` +
      `├─ Error catching\n` +
      `├─ Execution time measurement\n` +
      `├─ Output pagination\n` +
      `└─ Type inspection\n\n` +
      `**${emoji.get("add")} Usage Examples:**\n` +
      `├─ \`eval client.guilds.cache.size\`\n` +
      `├─ \`eval await client.users.fetch('123456789')\`\n` +
      `├─ \`eval process.memoryUsage()\`\n` +
      `└─ \`eval Object.keys(client.commands)\``;

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
    const title = isError ? "Evaluation Error" : "Evaluation Result";
    const titleEmoji = isError ? emoji.get("cross") : emoji.get("check");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${titleEmoji} ${title}`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let content = `**${emoji.get("folder")} Input Code:**\n\`\`\`javascript\n${this._truncateString(code, 300)}\n\`\`\`\n\n`;
    
    content += `**${emoji.get("info")} Execution Details:**\n`;
    content += `├─ **Type:** \`${type}\`\n`;
    content += `├─ **Time:** \`${executionTime.toFixed(2)}ms\`\n`;
    content += `└─ **Status:** ${isError ? 'Failed' : 'Success'}\n\n`;

    if (isError) {
      content += `**${emoji.get("cross")} Error Details:**\n`;
      content += `├─ **Name:** \`${error.name}\`\n`;
      content += `├─ **Message:** \`${error.message}\`\n`;
      
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(0, 5);
        content += `└─ **Stack:**\n\`\`\`\n${stackLines.join('\n')}\n\`\`\``;
      }
    } else {
      const output = this._formatOutput(result);
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

    // Add pagination buttons if needed
    const buttons = [];
    
    if (!isError && result) {
      const outputLines = this._formatOutput(result).split('\n');
      
      if (outputLines.length > ITEMS_PER_PAGE) {
        if (page > 0) {
          buttons.push(
            new ButtonBuilder()
              .setCustomId("eval_prev")
              .setLabel("Previous")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(emoji.get("reset"))
          );
        }
        
        if ((page + 1) * ITEMS_PER_PAGE < outputLines.length) {
          buttons.push(
            new ButtonBuilder()
              .setCustomId("eval_next")
              .setLabel("Next")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(emoji.get("add"))
          );
        }
      }
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId("eval_rerun")
        .setLabel("Re-run")
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji.get("reset")),
      new ButtonBuilder()
        .setCustomId("eval_help")
        .setLabel("Help")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("info"))
    );

    if (buttons.length > 0) {
      // Split buttons into rows if there are more than 5
      if (buttons.length <= 5) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
      } else {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons.slice(0, 5)));
      }
    }

    return container;
  }

  _formatOutput(result) {
    if (result === null) return 'null';
    if (result === undefined) return 'undefined';
    
    if (typeof result === 'string') {
      return result;
    }
    
    if (typeof result === 'function') {
      return result.toString();
    }
    
    if (result instanceof Error) {
      return result.stack || result.message;
    }
    
    try {
      return inspect(result, {
        depth: 2,
        colors: false,
        maxArrayLength: 100,
        maxStringLength: 1000,
        breakLength: 120,
        compact: false
      });
    } catch (error) {
      return String(result);
    }
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
        // Help collector doesn't need special handling, just keep it active
      } catch (error) {
        logger.error("EvalCommand", "Help collector error:", error);
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

        if (interaction.customId === "eval_prev") {
          if (currentPage > 0) {
            currentPage--;
            await interaction.editReply({
              components: [this._createResultContainer(code, result, error, type, executionTime, currentPage)]
            });
          }
        } else if (interaction.customId === "eval_next") {
          const outputLines = this._formatOutput(result).split('\n');
          const maxPages = Math.ceil(outputLines.length / ITEMS_PER_PAGE);
          
          if (currentPage < maxPages - 1) {
            currentPage++;
            await interaction.editReply({
              components: [this._createResultContainer(code, result, error, type, executionTime, currentPage)]
            });
          }
        } else if (interaction.customId === "eval_rerun") {
          await this._evaluateCode(client, { 
            reply: async (options) => await interaction.editReply(options),
            author: { id: userId }
          }, code);
        } else if (interaction.customId === "eval_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()]
          });
          return this._setupHelpCollector(message, userId, client);
        }
      } catch (error) {
        logger.error("EvalCommand", "Result collector error:", error);
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
          logger.error("EvalCommand", "Failed to disable components:", error);
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

export default new EvalCommand();
