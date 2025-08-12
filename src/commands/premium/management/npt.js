import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder,
  ButtonBuilder, StringSelectMenuBuilder, MessageFlags, SeparatorSpacingSize,
  ButtonStyle, ThumbnailBuilder, SectionBuilder
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import { config } from "#config/config";

class NoPrefixToggleCommand extends Command {
  constructor() {
    super({
      name: "noptoggle",
      description: "Toggle your personal no-prefix mode (Premium Only).",
      usage: "noptoggle [on/off]",
      aliases: ["npt", "noprefixtoggle", "noprefix", "nop"],
      category: "settings",
      examples: ["noptoggle", "noptoggle on", "npt off"],
      cooldown: 5,
      userPrem: true,
      enabledSlash: true,
      slashData: {
        name: "noptoggle",
        description: "Toggle your personal no-prefix mode (Premium Only).",
        options: [{
          name: "action",
          description: "Enable or disable no-prefix mode.",
          type: 3,
          required: false,
          autocomplete: true,
        }],
      },
    });
  }

  _createUIContainer(username, currentStatus, action = null) {
    const container = new ContainerBuilder();
    const statusText = currentStatus ? "Enabled" : "Disabled";
    const statusEmoji = currentStatus ? emoji.get('check') : emoji.get('cross');

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get('info')} No-Prefix Mode`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    let content = `Hello **${username}**! Your personal No-Prefix mode is currently **${statusText}** ${statusEmoji}.\n\n`;
    if (action) {
      content += `**Action Result:** Your no-prefix mode has been **${action}**!\n\n`;
    }

    if (currentStatus) {
      content += `**How it works:** You can now use commands without any prefix (e.g., \`ping\`). This setting follows you across all servers where I am present.`;
    } else {
      content += `**How it works:** You need to use a server's prefix or mention me to run commands (e.g., \`!ping\` or \`@Yukihana help\`).`;
    }

    const section = new SectionBuilder()
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    container.addSectionComponents(section);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
      .setCustomId("npt_toggle")
      .setLabel(currentStatus ? "Disable No-Prefix" : "Enable No-Prefix")
      .setStyle(currentStatus ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
      .setCustomId("npt_help")
      .setLabel("Help & Info")
      .setStyle(ButtonStyle.Secondary)
    );
    container.addActionRowComponents(buttons);
    return container;
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${emoji.get('info')} No-Prefix Help`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const content = `**What is No-Prefix Mode?**\nIt allows premium users to use bot commands without typing a prefix. Instead of \`!ping\`, you can just type \`ping\`.\n\n` +
      `**This is a personal setting** that follows you across all servers and can be toggled at any time.`;

    const section = new SectionBuilder()
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    container.addSectionComponents(section);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("npt_back").setLabel("Back to Settings").setStyle(ButtonStyle.Secondary)
    ));
    return container;
  }

  async _sendError(ctx, message) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${emoji.get('cross')} Error`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const section = new SectionBuilder()
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message));
    container.addSectionComponents(section);

    await ctx.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: true,
    });
  }

  async _handleCommand(ctx, arg) {
    const isInteraction = !!ctx.user;
    const author = isInteraction ? ctx.user : ctx.author;
    const userId = author.id;
    const username = author.username;
    const currentStatus = db.hasNoPrefix(userId);

    let newStatus = currentStatus;
    let action = null;

    if (arg) {
      const lowerArg = arg.toLowerCase();
      if (["on", "enable", "true"].includes(lowerArg)) {
        newStatus = true;
        action = "enabled";
      } else if (["off", "disable", "false"].includes(lowerArg)) {
        newStatus = false;
        action = "disabled";
      } else {
        return this._sendError(ctx, `**Invalid option:** \`${arg}\`\n\n**Valid options:** \`on\` or \`off\`.`);
      }
      db.setNoPrefix(userId, newStatus, null);
    }

    const container = this._createUIContainer(username, newStatus, action);
    const replyOptions = { components: [container], flags: MessageFlags.IsComponentsV2, fetchReply: true };
    const sent = await (isInteraction ? ctx.reply(replyOptions) : ctx.channel.send(replyOptions));
    this._setupCollector(sent, author);
  }

  async execute({ message, args }) {
    await this._handleCommand(message, args[0]);
  }

  async slashExecute({ interaction }) {
    await this._handleCommand(interaction, interaction.options.getString("action"));
  }

  _setupCollector(message, author) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === author.id,
      time: 300_000
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();
        const userId = interaction.user.id;
        const username = interaction.user.username;

        if (interaction.customId === "npt_toggle") {
          const currentStatus = db.hasNoPrefix(userId);
          const newStatus = !currentStatus;
          db.setNoPrefix(userId, newStatus, null);
          const updatedContainer = this._createUIContainer(username, newStatus, newStatus ? "enabled" : "disabled");
          await interaction.editReply({ components: [updatedContainer] });
        } else if (interaction.customId === "npt_help") {
          await interaction.editReply({ components: [this._createHelpContainer()] });
        } else if (interaction.customId === "npt_back") {
          const currentStatus = db.hasNoPrefix(userId);
          await interaction.editReply({ components: [this._createUIContainer(username, currentStatus)] });
        }
      } catch (error) {
        logger.error("NoPrefixToggle", "Collector Error:", error);
      }
    });

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
                logger.error("NoPrefixToggle", "Failed to disable components on end:", error);
            }
        }
    });
  }

  async autocomplete({ interaction }) {
    const focusedValue = interaction.options.getFocused();
    const choices = [
      { name: "Enable no-prefix mode", value: "on" },
      { name: "Disable no-prefix mode", value: "off" },
    ];
    const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase()));
    await interaction.respond(filtered);
  }
}

export default new NoPrefixToggleCommand();
