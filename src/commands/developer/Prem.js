import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";
import { ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, ThumbnailBuilder, MessageFlags } from "discord.js";

import { config } from "#config/config";
import { logger } from "#utils/logger";

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
      ownerOnly: true,
    });
  }

  async execute({ client, message, args }) {
    try {

      if (!config.ownerIds?.includes(message.author.id)) {
        const container   =new ContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Access Denied\n*This command is restricted to bot owners only*`)
          );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
      }

      if (!args.length) {
        return message.reply({
          components: [this._createHelpContainer()],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const action   =args[0].toLowerCase();

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
          const container   =new ContainerBuilder()
            .setAccentColor(0xed4245)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`### Invalid Action\n*Unknown action: ${action}*`)
            );
          await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          return message.reply({
            components: [this._createHelpContainer()],
            flags: MessageFlags.IsComponentsV2
          });
      }
    } catch (error) {
      logger.error("PremiumCommand", "Premium command error:", error);
      const container   =new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Error\n*An unexpected error occurred: ${error.message}*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  }

  async _handleGrant(client, message, args) {
    if (args.length < 2) {
      const container   =new ContainerBuilder()
        .setAccentColor(0xffa500)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Usage Error\n*premium grant <user|guild> <id> [duration] [reason]*\nDuration: 1d, 7d, 30d, perm (default: 30d)`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const type   =args[0].toLowerCase();
    let id   =args[1];

    if (id.startsWith("<@") && id.endsWith(">")) {
      id   =id.slice(2, -1);
      if (id.startsWith("!")) id   =id.slice(1);
    }

    const durationArg   =args[2] || "30d";
    const reason   =args.slice(3).join(" ") || "Premium granted by owner";

    if (!["user", "guild"].includes(type)) {
      const container   =new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Invalid Type\n*Type must be either 'user' or 'guild'*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    let expiresAt   =null;
    if (durationArg.toLowerCase()   !=="perm" && durationArg.toLowerCase()   !=="permanent") {
      const duration   =this._parseDuration(durationArg);
      if (!duration) {
        const container   =new ContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Invalid Duration\n*Use: 1d, 7d, 30d, or perm*`)
          );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
      expiresAt   =Date.now() + duration;
    }

    try {
      let result;
      if (type   ==="user") {
        result   =db.premium.grantUserPremium(id, message.author.id, expiresAt, reason);
      } else {
        result   =db.premium.grantGuildPremium(id, message.author.id, expiresAt, reason);
      }

      if (result && result.changes > 0) {
        const expiryText   =expiresAt
          ? `<t:${Math.floor(expiresAt / 1000)}:R>`
          : "Never (Permanent)";

        const container   =new ContainerBuilder()
          .setAccentColor(0x00ff00);

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### Premium Granted')
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const thumbnailUrl   =config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png';

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('**Operation Successful**'),
              new TextDisplayBuilder().setContent(`*Granted ${type} premium to ${id}*\nExpires: ${expiryText}\nReason: ${reason}`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
        );

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } else {
        const container   =new ContainerBuilder()
          .setAccentColor(0xed4245);

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### Premium Grant Failed')
        );

        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const thumbnailUrl   =config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png';

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('**Operation Failed**'),
              new TextDisplayBuilder().setContent(`*Unable to grant premium to ${type} ${id}*`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
        );

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
    } catch (error) {
      logger.error("PremiumCommand", "Error granting premium:", error);
      const container   =new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Error\n*Error granting premium: ${error.message}*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  }

  async _handleRevoke(client, message, args) {
    if (args.length < 2) {
      const container   =new ContainerBuilder()
        .setAccentColor(0xffa500)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Usage Error\n*premium revoke <user|guild> <id>*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const type   =args[0].toLowerCase();
    let id   =args[1];

    if (id.startsWith("<@") && id.endsWith(">")) {
      id   =id.slice(2, -1);
      if (id.startsWith("!")) id   =id.slice(1);
    }

    if (!["user", "guild"].includes(type)) {
      const container   =new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Invalid Type\n*Type must be either 'user' or 'guild'*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    try {
      let result;
      if (type   ==="user") {
        result   =db.premium.revokeUserPremium(id);
      } else {
        result   =db.premium.revokeGuildPremium(id);
      }

      if (result && result.changes > 0) {
        const container   =new ContainerBuilder()
          .setAccentColor(0x00ff00)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Premium Revoked\n*Successfully revoked ${type} premium from \`${id}\`*`)
          );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } else {
        const container   =new ContainerBuilder()
          .setAccentColor(0xffa500)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Revoke Failed\n*Failed to revoke premium from ${type} \`${id}\` (may not have premium)*`)
          );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
    } catch (error) {
      logger.error("PremiumCommand", "Error revoking premium:", error);
      const container   =new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Error\n*Error revoking premium: ${error.message}*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  }

  async _handleStats(client, message) {
    try {
      const stats = db.premium.getStats();

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### Premium Statistics')
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      let content = `**Users:** ${stats.total.users} (${stats.active.users} active)\n`;
      content += `**Guilds:** ${stats.total.guilds} (${stats.active.guilds} active)\n`;
      content += `**Total Active:** ${stats.active.total}\n`;
      content += `**Total Registered:** ${stats.total.total}`;

      const userPremiums = db.premium.getAllUserPremiums().slice(0, 5);
      const guildPremiums = db.premium.getAllGuildPremiums().slice(0, 5);

      if (userPremiums.length > 0) {
        content += "\n\n**Recent User Premiums:**\n";
        userPremiums.forEach((prem) => {
          const expiry = prem.expires_at
            ? `<t:${Math.floor(prem.expires_at / 1000)}:R>`
            : "Permanent";
          content += `• \`${prem.user_id}\` - ${expiry}\n`;
        });
      }

      if (guildPremiums.length > 0) {
        content += "\n**Recent Guild Premiums:**\n";
        guildPremiums.forEach((prem) => {
          const expiry = prem.expires_at
            ? `<t:${Math.floor(prem.expires_at / 1000)}:R>`
            : "Permanent";
          content += `• \`${prem.guild_id}\` - ${expiry}\n`;
        });
      }

      const thumbnailUrl = config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png';

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      logger.error("PremiumCommand", "Error fetching stats:", error);
      const container   =new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Error\n*Error fetching stats: ${error.message}*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  }

  async _handleCleanup(client, message) {
    try {
      const result   =db.premium.cleanupExpired();

      const container   =new ContainerBuilder()
        .setAccentColor(0x00ff00);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### Cleanup Completed')
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const thumbnailUrl   =config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png';

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Cleanup Results**`),
            new TextDisplayBuilder().setContent(`*Removed ${result.usersRevoked} expired user premiums and ${result.guildsRevoked} expired guild premiums.*\nTotal cleaned: ${result.total}`)
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
      logger.error("PremiumCommand", "Error during cleanup:", error);
      const container   =new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### Error\n*Error during cleanup: ${error.message}*`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  }

  _parseDuration(duration) {
    const match   =duration.match(/^(\d+)([dhm])$/i);
    if (!match) return null;

    const value   =parseInt(match[1]);
    const unit   =match[2].toLowerCase();

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

  _createHelpContainer() {
    const container   =new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### Premium Commands Help')
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content   =`**Available Commands:**
\`premium grant <user|guild> <id> [duration] [reason]\` - Grant premium
\`premium revoke <user|guild> <id>\` - Revoke premium
\`premium stats\` - View premium statistics
\`premium cleanup\` - Remove expired premiums


• \`premium grant user 123456789 30d VIP user\`
• \`premium grant guild 987654321 perm Server boost\`
• \`premium revoke user 123456789\``;

    const thumbnailUrl   =config.assets?.defaultThumbnail || 'https://cdn.discordapp.com/embed/avatars/2.png';

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
    );

    return container;
  }
}

export default new PremiumCommand();
