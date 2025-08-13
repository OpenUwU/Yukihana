import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SeparatorSpacingSize,
  ButtonStyle,
  MessageFlags,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { config } from "#config/config";
import { logger } from "#utils/logger";

const USER_PREFIX_LIMIT = 3;

class UserPrefixCommand extends Command {
  constructor() {
    super({
      name: "userprefix",
      description: "Manage your personal command prefixes (Premium Only).",
      usage: "userprefix [prefix]",
      aliases: ["up", "myprefix"],
      category: "settings",
      examples: ["userprefix", "userprefix !", "up $"],
      cooldown: 5,
      userPrem: true,
      enabledSlash: true,
      slashData: {
        name: "userprefix",
        description: "Manage your personal command prefixes (Premium Only).",
        options: [
          {
            name: "add",
            description: "Add a new personal prefix.",
            type: 3,
            required: false,
            max_length: 5,
          },
        ],
      },
    });
  }

  _buildUIManagementContainer(username, prefixes = [], actionMessage = null) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emoji.get("info")} Personal Prefix Management`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const prefixList =
      prefixes.length > 0
        ? prefixes.map((p) => `\`${p}\``).join(" ")
        : `${emoji.get("cross")} You have no custom prefixes.`;

    let content = actionMessage ? `${actionMessage}\n\n` : "";
    content += `${emoji.get("check")} **Your Prefixes (${prefixes.length}/${USER_PREFIX_LIMIT}):**\n${prefixList}\n\n${emoji.get("info")} *These prefixes work for you in any server I'm in.*`;

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
          .setCustomId("up_add")
          .setLabel("Add Prefix")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("add"))
          .setDisabled(prefixes.length >= USER_PREFIX_LIMIT),
        new ButtonBuilder()
          .setCustomId("up_remove_all")
          .setLabel("Remove All")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("reset"))
          .setDisabled(prefixes.length === 0),
      ),
    );

    if (prefixes.length > 0) {
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("up_remove_select")
            .setPlaceholder("Select specific prefixes to remove...")
            .setMinValues(1)
            .setMaxValues(prefixes.length)
            .addOptions(
              prefixes.map((p) => ({
                label: `Remove prefix: "${p}"`,
                value: p,
                emoji: "🗑️",
              })),
            ),
        ),
      );
    }

    return container;
  }

  async _sendResponse(ctx, isSuccess, message) {
    const container = new ContainerBuilder();
    const e = isSuccess ? emoji.get("check") : emoji.get("cross");
    const title = isSuccess ? "Success" : "Error";

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${e} ${title}`),
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
      ephemeral: !isSuccess,
    });
  }

  async _addPrefix(userId, newPrefix) {
    if (!newPrefix || newPrefix.trim() === "") {
      return {
        success: false,
        message: `${emoji.get("cross")} **Invalid Input**\nPlease provide a valid prefix.`,
      };
    }

    const trimmedPrefix = newPrefix.trim();

    if (trimmedPrefix.length > 5) {
      return {
        success: false,
        message: `${emoji.get("cross")} **Prefix Too Long**\nMaximum 5 characters allowed.`,
      };
    }

    const currentPrefixes = db.getUserPrefixes(userId);

    if (currentPrefixes.length >= USER_PREFIX_LIMIT) {
      return {
        success: false,
        message: `${emoji.get("cross")} **Limit Reached**\nYou can only have ${USER_PREFIX_LIMIT} custom prefixes.\n${emoji.get("info")} Remove some existing prefixes first.`,
      };
    }

    if (currentPrefixes.includes(trimmedPrefix)) {
      return {
        success: false,
        message: `${emoji.get("cross")} **Prefix Already Exists**\nThe prefix \`${trimmedPrefix}\` is already in your list.`,
      };
    }

    const newPrefixes = [...currentPrefixes, trimmedPrefix];
    db.setUserPrefixes(userId, newPrefixes);

    return {
      success: true,
      message: `${emoji.get("check")} **Successfully added prefix:** \`${trimmedPrefix}\``,
      prefixes: newPrefixes,
    };
  }

  async _handleCommand(ctx, directPrefix = null) {
    const isInteraction = !!ctx.user;
    const author = isInteraction ? ctx.user : ctx.author;
    const userId = author.id;
    const username = author.username;

    if (directPrefix) {
      const result = await this._addPrefix(userId, directPrefix);
      return this._sendResponse(ctx, result.success, result.message);
    }

    const message = await (isInteraction
      ? ctx.reply({
          components: [
            this._buildUIManagementContainer(
              username,
              db.getUserPrefixes(userId),
            ),
          ],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        })
      : ctx.channel.send({
          components: [
            this._buildUIManagementContainer(
              username,
              db.getUserPrefixes(userId),
            ),
          ],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true,
        }));

    this._setupCollector(message, userId, username);
  }

  async execute({ message, args }) {
    await this._handleCommand(message, args[0]);
  }

  async slashExecute({ interaction }) {
    await this._handleCommand(
      interaction,
      interaction.options.getString("add"),
    );
  }

  _setupCollector(message, userId, username) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000,
    });

    collector.on("collect", async (interaction) => {
      try {
        let prefixes = db.getUserPrefixes(userId);
        let actionMessage = null;

        if (interaction.customId === "up_add") {
          const modal = new ModalBuilder()
            .setCustomId("up_add_modal")
            .setTitle("Add Personal Prefix")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("new_prefix_input")
                  .setLabel("New Prefix (max 5 characters)")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(5)
                  .setPlaceholder("Enter your custom prefix..."),
              ),
            );

          await interaction.showModal(modal);

          try {
            const modalSubmit = await interaction.awaitModalSubmit({
              time: 60000,
            });
            const newPrefix =
              modalSubmit.fields.getTextInputValue("new_prefix_input");
            const result = await this._addPrefix(userId, newPrefix);

            prefixes = db.getUserPrefixes(userId);
            actionMessage = result.message;

            await modalSubmit.deferUpdate();
            await interaction.editReply({
              components: [
                this._buildUIManagementContainer(
                  username,
                  prefixes,
                  actionMessage,
                ),
              ],
            });
          } catch (error) {
            return;
          }
        } else if (interaction.customId === "up_remove_all") {
          await interaction.deferUpdate();
          db.setUserPrefixes(userId, []);
          prefixes = [];
          actionMessage = `${emoji.get("check")} **All custom prefixes removed successfully!**`;
          await interaction.editReply({
            components: [
              this._buildUIManagementContainer(
                username,
                prefixes,
                actionMessage,
              ),
            ],
          });
        } else if (
          interaction.isStringSelectMenu() &&
          interaction.customId === "up_remove_select"
        ) {
          await interaction.deferUpdate();
          const valuesToRemove = interaction.values;
          prefixes = prefixes.filter((p) => !valuesToRemove.includes(p));
          db.setUserPrefixes(userId, prefixes);

          const removedList = valuesToRemove.map((p) => `\`${p}\``).join(", ");
          actionMessage = `${emoji.get("check")} **Removed prefixes:** ${removedList}`;

          await interaction.editReply({
            components: [
              this._buildUIManagementContainer(
                username,
                prefixes,
                actionMessage,
              ),
            ],
          });
        }
      } catch (error) {
        logger.error("UserPrefix", "Collector Error:", error);
      }
    });

    collector.on("end", async () => {
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
        if (error.code !== 10008) {
          logger.error(
            "UserPrefix",
            "Failed to disable components on end:",
            error,
          );
        }
      }
    });
  }
}

export default new UserPrefixCommand();
