import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  ButtonStyle,
  ThumbnailBuilder,
  SectionBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
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
        options: [
          {
            name: "action",
            description: "Enable or disable no-prefix mode.",
            type: 3,
            required: false,
            autocomplete: true,
          },
        ],
      },
    });
  }

  _createUIContainer(username, currentStatus, action = null) {
    const container = new ContainerBuilder();
    const statusText = currentStatus ? "Enabled" : "Disabled";
    const statusEmoji = currentStatus ? emoji.get("check") : emoji.get("cross");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emoji.get("info")} No-Prefix Mode`,
      ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    let content = `**Hello ${username}!** Manage your personal no-prefix mode here.\n\n`;

    if (action) {
      content += `${emoji.get("check")} **Action Result**\nYour no-prefix mode has been **${action}**!\n\n`;
    }

    content += `**${emoji.get("folder")} Current Status:** ${statusText} ${statusEmoji}\n\n`;

    content += `**${emoji.get("add")} How it works:**\n`;
    if (currentStatus) {
      content += `├─ You can use commands without any prefix\n`;
      content += `├─ Example: Type \`ping\` instead of \`!ping\`\n`;
      content += `├─ Works in all servers where I am present\n`;
      content += `└─ This is your personal setting\n\n`;
    } else {
      content += `├─ You need to use a server's prefix or mention me\n`;
      content += `├─ Example: Use \`!ping\` or \`@Yukihana ping\`\n`;
      content += `├─ Enable this to use commands without prefixes\n`;
      content += `└─ Premium feature for enhanced convenience\n\n`;
    }

    content += `**${emoji.get("reset")} Benefits:**\n`;
    content += `├─ Faster command usage without typing prefixes\n`;
    content += `├─ Works across all servers instantly\n`;
    content += `├─ Toggle on/off anytime you want\n`;
    content += `└─ Premium exclusive feature`;

    const section = new SectionBuilder()
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("npt_toggle")
        .setLabel(currentStatus ? "Disable No-Prefix" : "Enable No-Prefix")
        .setStyle(currentStatus ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(currentStatus ? emoji.get("cross") : emoji.get("check")),
      new ButtonBuilder()
        .setCustomId("npt_help")
        .setLabel("Help & Info")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("info")),
    );
    container.addActionRowComponents(buttons);
    return container;
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emoji.get("info")} No-Prefix Help`,
      ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**What is No-Prefix Mode?**\nA premium feature that allows you to use bot commands without typing a prefix.\n\n` +
      `**${emoji.get("check")} How it works:**\n` +
      `├─ Instead of \`!ping\`, just type \`ping\`\n` +
      `├─ Instead of \`!play song\`, just type \`play song\`\n` +
      `├─ Works in all servers where I am present\n` +
      `└─ This is your personal setting that follows you\n\n` +
      `**${emoji.get("folder")} Examples:**\n` +
      `├─ \`help\` → Shows help menu\n` +
      `├─ \`play never gonna give you up\` → Plays music\n` +
      `├─ \`queue\` → Shows music queue\n` +
      `└─ \`botinfo\` → Shows bot information\n\n` +
      `**${emoji.get("add")} Benefits:**\n` +
      `├─ Faster command execution\n` +
      `├─ More convenient for frequent users\n` +
      `├─ Toggle on/off anytime\n` +
      `└─ Premium exclusive feature`;

    const section = new SectionBuilder()
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("npt_back")
          .setLabel("Back to Settings")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("reset")),
      ),
    );
    return container;
  }

  async _sendError(ctx, message) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} Error`),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const section = new SectionBuilder()
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message));
    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

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
        return this._sendError(
          ctx,
          `**Invalid option:** \`${arg}\`\n\n**Valid options:**\n├─ \`on\` or \`enable\` - Enable no-prefix mode\n└─ \`off\` or \`disable\` - Disable no-prefix mode`,
        );
      }
      db.setNoPrefix(userId, newStatus, null);
    }

    const container = this._createUIContainer(username, newStatus, action);
    const replyOptions = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    const sent = await (isInteraction
      ? ctx.reply(replyOptions)
      : ctx.channel.send(replyOptions));
    this._setupCollector(sent, author);
  }

  async execute({ message, args }) {
    await this._handleCommand(message, args[0]);
  }

  async slashExecute({ interaction }) {
    await this._handleCommand(
      interaction,
      interaction.options.getString("action"),
    );
  }

  _setupCollector(message, author) {
    const filter = (i) => i.user.id === author.id;
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300_000,
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
          const updatedContainer = this._createUIContainer(
            username,
            newStatus,
            newStatus ? "enabled" : "disabled",
          );
          await interaction.editReply({ components: [updatedContainer] });
        } else if (interaction.customId === "npt_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "npt_back") {
          const currentStatus = db.hasNoPrefix(userId);
          await interaction.editReply({
            components: [this._createUIContainer(username, currentStatus)],
          });
        }
      } catch (error) {
        logger.error("NoPrefixToggle", "Collector Error:", error);
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "limit" || reason === "messageDelete") return;

      try {
        const currentMessage = await this._fetchMessage(message).catch(
          () => null,
        );

        if (!currentMessage?.components?.length) {
          return;
        }

        const success = await this._disableAllComponents(currentMessage);

        if (success) {
          logger.debug(
            "NoPrefixToggle",
            `Components disabled successfully. Reason: ${reason}`,
          );
        }
      } catch (error) {
        this._handleDisableError(error, reason);
      }
    });

    collector.on("dispose", async (interaction) => {
      logger.debug(
        "NoPrefixToggle",
        `Interaction disposed: ${interaction.customId}`,
      );
    });
  }

  async _disableAllComponents(message) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error) {
      logger.error(
        "NoPrefixToggle",
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

  _handleDisableError(error, reason) {
    if (error.code === 10008) {
      logger.debug(
        "NoPrefixToggle",
        `Message was deleted, cannot disable components. Reason: ${reason}`,
      );
    } else if (error.code === 50001) {
      logger.warn(
        "NoPrefixToggle",
        `Missing permissions to edit message. Reason: ${reason}`,
      );
    } else {
      logger.error(
        "NoPrefixToggle",
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

  async autocomplete({ interaction }) {
    const focusedValue = interaction.options.getFocused();
    const choices = [
      { name: "Enable no-prefix mode", value: "on" },
      { name: "Disable no-prefix mode", value: "off" },
    ];
    const filtered = choices.filter((choice) =>
      choice.name.toLowerCase().includes(focusedValue.toLowerCase()),
    );
    await interaction.respond(filtered);
  }
}

export default new NoPrefixToggleCommand();
