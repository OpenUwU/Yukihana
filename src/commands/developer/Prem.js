import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";
import { 
  ContainerBuilder, 
  TextDisplayBuilder, 
  SectionBuilder, 
  SeparatorBuilder, 
  SeparatorSpacingSize, 
  ThumbnailBuilder, 
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

const ITEMS_PER_PAGE = 5;

class PremiumCommand extends Command {
  constructor() {
    super({
      name: "premium",
      description: "Manage premium subscriptions for users and guilds (Owner Only)",
      usage: "premium <grant|revoke|stats|cleanup> [type] [id] [duration] [reason]",
      aliases: ["prem"],
      category: "developer",
      examples: [
        "premium grant user 123456789 30d Premium granted",
        "premium grant guild 987654321 perm Guild premium",
        "premium revoke user 123456789",
        "premium stats",
        "premium cleanup"
      ],
      ownerOnly: true
    });
  }

  async execute({ client, message, args }) {
    try {
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

      const action = args[0].toLowerCase();

      switch (action) {
        case "grant":
          return await this._handleGrant(client, message, args.slice(1));
        case "revoke":
          return await this._handleRevoke(client, message, args.slice(1));
        case "stats":
          return await this._handleStats(client, message);
        case "cleanup":
          return await this._handleCleanup(client, message);
        default:
          return this._sendError(message, "Invalid Action", `Unknown action: \`${action}\`\n\n**Valid actions:**\n├─ \`grant\` - Grant premium to user/guild\n├─ \`revoke\` - Revoke premium from user/guild\n├─ \`stats\` - View premium statistics\n└─ \`cleanup\` - Remove expired premiums`);
      }
    } catch (error) {
      logger.error("PremiumCommand", "Premium command error:", error);
      return this._sendError(message, "Error", `An unexpected error occurred:\n\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  async _handleGrant(client, message, args) {
    if (args.length < 2) {
      return this._sendError(
        message, 
        "Usage Error", 
        `**Command Format:**\n\`premium grant <user|guild> <id> [duration] [reason]\`\n\n**Duration Options:**\n├─ \`1d\` - 1 day\n├─ \`7d\` - 7 days\n├─ \`30d\` - 30 days (default)\n└─ \`perm\` - Permanent`
      );
    }

    const type = args[0].toLowerCase();
    let id = args[1];

    if (id.startsWith("<@") && id.endsWith(">")) {
      id = id.slice(2, -1);
      if (id.startsWith("!")) id = id.slice(1);
    }

    const durationArg = args[2] || "30d";
    const reason = args.slice(3).join(" ") || "Premium granted by owner";

    if (!["user", "guild"].includes(type)) {
      return this._sendError(message, "Invalid Type", `Type must be either \`user\` or \`guild\`.\n\n**Examples:**\n├─ \`premium grant user 123456789 30d\`\n└─ \`premium grant guild 987654321 perm\``);
    }

    let expiresAt = null;
    if (durationArg.toLowerCase() !== "perm" && durationArg.toLowerCase() !== "permanent") {
      const duration = this._parseDuration(durationArg);
      if (!duration) {
        return this._sendError(message, "Invalid Duration", `**Valid durations:**\n├─ \`1d\` - 1 day\n├─ \`7d\` - 7 days\n├─ \`30d\` - 30 days\n└─ \`perm\` - Permanent`);
      }
      expiresAt = Date.now() + duration;
    }

    try {
      let result;
      if (type === "user") {
        result = db.premium.grantUserPremium(id, message.author.id, expiresAt, reason);
      } else {
        result = db.premium.grantGuildPremium(id, message.author.id, expiresAt, reason);
      }

      if (result && result.changes > 0) {
        const expiryText = expiresAt
          ? `<t:${Math.floor(expiresAt / 1000)}:R>`
          : "Never (Permanent)";

        return this._sendSuccess(
          message,
          "Premium Granted",
          `**Successfully granted ${type} premium!**\n\n**${emoji.get("folder")} Details:**\n├─ **Target:** \`${id}\`\n├─ **Type:** ${type.charAt(0).toUpperCase() + type.slice(1)}\n├─ **Expires:** ${expiryText}\n└─ **Reason:** ${reason}`
        );
      } else {
        return this._sendError(message, "Grant Failed", `Unable to grant premium to ${type} \`${id}\`.\n\nThey may already have active premium or the ID is invalid.`);
      }
    } catch (error) {
      logger.error("PremiumCommand", "Error granting premium:", error);
      return this._sendError(message, "Database Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  async _handleRevoke(client, message, args) {
    if (args.length < 2) {
      return this._sendError(message, "Usage Error", `**Command Format:**\n\`premium revoke <user|guild> <id>\`\n\n**Examples:**\n├─ \`premium revoke user 123456789\`\n└─ \`premium revoke guild 987654321\``);
    }

    const type = args[0].toLowerCase();
    let id = args[1];

    if (id.startsWith("<@") && id.endsWith(">")) {
      id = id.slice(2, -1);
      if (id.startsWith("!")) id = id.slice(1);
    }

    if (!["user", "guild"].includes(type)) {
      return this._sendError(message, "Invalid Type", `Type must be either \`user\` or \`guild\`.\n\n**Examples:**\n├─ \`premium revoke user 123456789\`\n└─ \`premium revoke guild 987654321\``);
    }

    try {
      let result;
      if (type === "user") {
        result = db.premium.revokeUserPremium(id);
      } else {
        result = db.premium.revokeGuildPremium(id);
      }

      if (result && result.changes > 0) {
        return this._sendSuccess(
          message,
          "Premium Revoked",
          `**Successfully revoked ${type} premium!**\n\n**${emoji.get("folder")} Details:**\n├─ **Target:** \`${id}\`\n└─ **Type:** ${type.charAt(0).toUpperCase() + type.slice(1)}`
        );
      } else {
        return this._sendError(
          message, 
          "Revoke Failed", 
          `Failed to revoke premium from ${type} \`${id}\`.\n\nThey may not have active premium or the ID is invalid.`
        );
      }
    } catch (error) {
      logger.error("PremiumCommand", "Error revoking premium:", error);
      return this._sendError(message, "Database Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  async _handleStats(client, message) {
    try {
      const stats = db.premium.getStats();
      const userPremiums = db.premium.getAllUserPremiums();
      const guildPremiums = db.premium.getAllGuildPremiums();

      const sent = await message.reply({
        components: [this._createStatsContainer(stats, userPremiums, guildPremiums, 0, 0)],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true
      });

      this._setupStatsCollector(sent, message.author.id, stats, userPremiums, guildPremiums);
    } catch (error) {
      logger.error("PremiumCommand", "Error fetching stats:", error);
      return this._sendError(message, "Database Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  async _handleCleanup(client, message) {
    try {
      const result = db.premium.cleanupExpired();

      return this._sendSuccess(
        message,
        "Cleanup Complete",
        `**Cleanup operation successful!**\n\n**${emoji.get("folder")} Results:**\n├─ **User premiums removed:** ${result.usersRevoked}\n├─ **Guild premiums removed:** ${result.guildsRevoked}\n└─ **Total cleaned:** ${result.total}`
      );
    } catch (error) {
      logger.error("PremiumCommand", "Error during cleanup:", error);
      return this._sendError(message, "Cleanup Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Premium Management`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Available premium management commands:**\n\n` +
      `**${emoji.get("check")} Commands:**\n` +
      `├─ \`premium grant <user|guild> <id> [duration] [reason]\`\n` +
      `├─ \`premium revoke <user|guild> <id>\`\n` +
      `├─ \`premium stats\`\n` +
      `└─ \`premium cleanup\`\n\n` +
      `**${emoji.get("folder")} Duration Examples:**\n` +
      `├─ \`1d\` - 1 day\n` +
      `├─ \`7d\` - 7 days\n` +
      `├─ \`30d\` - 30 days\n` +
      `└─ \`perm\` - Permanent\n\n` +
      `**${emoji.get("add")} Usage Examples:**\n` +
      `├─ \`premium grant user 123456789 30d VIP user\`\n` +
      `├─ \`premium grant guild 987654321 perm Server boost\`\n` +
      `├─ \`premium revoke user 123456789\`\n` +
      `└─ \`premium stats\``;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prem_stats")
          .setLabel("View Statistics")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("folder"))
      )
    );

    return container;
  }

  _createStatsContainer(stats, userPremiums, guildPremiums, userPage, guildPage) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("folder")} Premium Statistics`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let content = `**Overview:**\n` +
      `├─ **Users:** ${stats.total.users} (${stats.active.users} active)\n` +
      `├─ **Guilds:** ${stats.total.guilds} (${stats.active.guilds} active)\n` +
      `├─ **Total Active:** ${stats.active.total}\n` +
      `└─ **Total Registered:** ${stats.total.total}\n\n`;

    const userStart = userPage * ITEMS_PER_PAGE;
    const userEnd = Math.min(userStart + ITEMS_PER_PAGE, userPremiums.length);
    const guildStart = guildPage * ITEMS_PER_PAGE;
    const guildEnd = Math.min(guildStart + ITEMS_PER_PAGE, guildPremiums.length);

    if (userPremiums.length > 0) {
      content += `**${emoji.get("check")} User Premiums (${userStart + 1}-${userEnd} of ${userPremiums.length}):**\n`;
      if (userEnd > userStart) {
        userPremiums.slice(userStart, userEnd).forEach((prem, index) => {
          const expiry = prem.expires_at ? `<t:${Math.floor(prem.expires_at / 1000)}:R>` : "Permanent";
          const isLast = index === (userEnd - userStart - 1) && guildPremiums.length === 0;
          content += `${isLast ? '└─' : '├─'} \`${prem.user_id}\` - ${expiry}\n`;
        });
      }
    }

    if (guildPremiums.length > 0) {
      content += `\n**${emoji.get("add")} Guild Premiums (${guildStart + 1}-${guildEnd} of ${guildPremiums.length}):**\n`;
      if (guildEnd > guildStart) {
        guildPremiums.slice(guildStart, guildEnd).forEach((prem, index) => {
          const expiry = prem.expires_at ? `<t:${Math.floor(prem.expires_at / 1000)}:R>` : "Permanent";
          const isLast = index === (guildEnd - guildStart - 1);
          content += `${isLast ? '└─' : '├─'} \`${prem.guild_id}\` - ${expiry}\n`;
        });
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
    
    if (userPremiums.length > ITEMS_PER_PAGE || guildPremiums.length > ITEMS_PER_PAGE) {
      if (userPage > 0 || guildPage > 0) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId("prem_prev")
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("reset"))
        );
      }
      
      if (userEnd < userPremiums.length || guildEnd < guildPremiums.length) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId("prem_next")
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("add"))
        );
      }
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId("prem_help")
        .setLabel("Back to Help")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("info"))
    );

    if (buttons.length > 0) {
      container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
    }

    return container;
  }

  _parseDuration(duration) {
    const match = duration.match(/^(\d+)([dhm])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }

  _setupHelpCollector(message, userId, client) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction) => {
      try {
        if (interaction.customId === "prem_stats") {
          await interaction.deferUpdate();
          const stats = db.premium.getStats();
          const userPremiums = db.premium.getAllUserPremiums();
          const guildPremiums = db.premium.getAllGuildPremiums();
          
          await interaction.editReply({
            components: [this._createStatsContainer(stats, userPremiums, guildPremiums, 0, 0)]
          });
          
          this._setupStatsCollector(message, userId, stats, userPremiums, guildPremiums);
        }
      } catch (error) {
        logger.error("PremiumCommand", "Help collector error:", error);
      }
    });

    this._setupCollectorEnd(collector, message);
  }

  _setupStatsCollector(message, userId, stats, userPremiums, guildPremiums) {
    let userPage = 0;
    let guildPage = 0;

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === "prem_prev") {
          if (guildPage > 0) {
            guildPage--;
          } else if (userPage > 0) {
            userPage--;
            guildPage = Math.max(0, Math.ceil(guildPremiums.length / ITEMS_PER_PAGE) - 1);
          }
        } else if (interaction.customId === "prem_next") {
          const maxUserPages = Math.ceil(userPremiums.length / ITEMS_PER_PAGE);
          const maxGuildPages = Math.ceil(guildPremiums.length / ITEMS_PER_PAGE);
          
          if (userPage < maxUserPages - 1) {
            userPage++;
          } else if (guildPage < maxGuildPages - 1) {
            guildPage++;
          }
        } else if (interaction.customId === "prem_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()]
          });
          return this._setupHelpCollector(message, userId);
        }

        await interaction.editReply({
          components: [this._createStatsContainer(stats, userPremiums, guildPremiums, userPage, guildPage)]
        });
      } catch (error) {
        logger.error("PremiumCommand", "Stats collector error:", error);
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
          logger.error("PremiumCommand", "Failed to disable components:", error);
        }
      }
    });
  }

  _sendSuccess(message, title, description) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("check")} ${title}`)
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
      flags: MessageFlags.IsComponentsV2 
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

export default new PremiumCommand();
