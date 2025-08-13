import { Command } from "#structures/classes/Command";
import { db } from "#database/DatabaseManager";
import { 
	ContainerBuilder, 
	TextDisplayBuilder, 
	SectionBuilder, 
	SeparatorBuilder, 
	SeparatorSpacingSize, 
	ThumbnailBuilder, 
	MessageFlags 
} from "discord.js";

import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

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
				return this._sendError(message, "Access Denied", "This command is restricted to bot owners only.");
			}

			if (!args.length) {
				return message.reply({
					components: [this._createHelpContainer()],
					flags: MessageFlags.IsComponentsV2
				});
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
					return this._sendError(message, "Invalid Action", `Unknown action: ${action}. Use grant, revoke, stats, or cleanup.`);
			}
		} catch (error) {
			logger.error("PremiumCommand", "Premium command error:", error);
			return this._sendError(message, "Error", `An unexpected error occurred: ${error.message}`);
		}
	}

	async _handleGrant(client, message, args) {
		if (args.length < 2) {
			return this._sendError(
				message, 
				"Usage Error", 
				`${emoji.get("info")} **Command Format:**\npremium grant <user|guild> <id> [duration] [reason]\n\n${emoji.get("info")} **Duration Options:** 1d, 7d, 30d, perm (default: 30d)`
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
			return this._sendError(message, "Invalid Type", `${emoji.get("cross")} Type must be either **user** or **guild**.`);
		}

		let expiresAt = null;
		if (durationArg.toLowerCase() !== "perm" && durationArg.toLowerCase() !== "permanent") {
			const duration = this._parseDuration(durationArg);
			if (!duration) {
				return this._sendError(message, "Invalid Duration", `${emoji.get("cross")} **Valid durations:** 1d, 7d, 30d, or perm`);
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

				const typeIcon = type === "user" ? "👤" : "🏠";
				return this._sendSuccess(
					message,
					"Premium Granted",
					`${emoji.get("check")} **Successfully granted ${type} premium!**\n\n${typeIcon} **Target:** \`${id}\`\n⏰ **Expires:** ${expiryText}\n📝 **Reason:** ${reason}`
				);
			} else {
				return this._sendError(message, "Grant Failed", `${emoji.get("cross")} Unable to grant premium to ${type} \`${id}\`.\n${emoji.get("info")} They may already have active premium.`);
			}
		} catch (error) {
			logger.error("PremiumCommand", "Error granting premium:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} **Database Error:**\n${error.message}`);
		}
	}

	async _handleRevoke(client, message, args) {
		if (args.length < 2) {
			return this._sendError(message, "Usage Error", `${emoji.get("info")} **Command Format:**\npremium revoke <user|guild> <id>`);
		}

		const type = args[0].toLowerCase();
		let id = args[1];

		if (id.startsWith("<@") && id.endsWith(">")) {
			id = id.slice(2, -1);
			if (id.startsWith("!")) id = id.slice(1);
		}

		if (!["user", "guild"].includes(type)) {
			return this._sendError(message, "Invalid Type", `${emoji.get("cross")} Type must be either **user** or **guild**.`);
		}

		try {
			let result;
			if (type === "user") {
				result = db.premium.revokeUserPremium(id);
			} else {
				result = db.premium.revokeGuildPremium(id);
			}

			if (result && result.changes > 0) {
				const typeIcon = type === "user" ? "👤" : "🏠";
				return this._sendSuccess(
					message,
					"Premium Revoked",
					`${emoji.get("check")} **Successfully revoked ${type} premium!**\n\n${typeIcon} **Target:** \`${id}\``
				);
			} else {
				return this._sendError(
					message, 
					"Revoke Failed", 
					`${emoji.get("cross")} Failed to revoke premium from ${type} \`${id}\`.\n${emoji.get("info")} They may not have active premium.`
				);
			}
		} catch (error) {
			logger.error("PremiumCommand", "Error revoking premium:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} **Database Error:**\n${error.message}`);
		}
	}

	async _handleStats(client, message) {
		try {
			const stats = db.premium.getStats();

			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Premium Statistics`)
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			let content = `${emoji.get("check")} **Users:** ${stats.total.users} (${stats.active.users} active)\n`;
			content += `${emoji.get("check")} **Guilds:** ${stats.total.guilds} (${stats.active.guilds} active)\n`;
			content += `${emoji.get("info")} **Total Active:** ${stats.active.total}\n`;
			content += `${emoji.get("info")} **Total Registered:** ${stats.total.total}`;

			const userPremiums = db.premium.getAllUserPremiums().slice(0, 5);
			const guildPremiums = db.premium.getAllGuildPremiums().slice(0, 5);

			if (userPremiums.length > 0) {
				content += `\n\n👤 **Recent User Premiums:**\n`;
				userPremiums.forEach((prem) => {
					const expiry = prem.expires_at
						? `<t:${Math.floor(prem.expires_at / 1000)}:R>`
						: "Permanent";
					content += `${emoji.get("check")} \`${prem.user_id}\` - ${expiry}\n`;
				});
			}

			if (guildPremiums.length > 0) {
				content += `\n🏠 **Recent Guild Premiums:**\n`;
				guildPremiums.forEach((prem) => {
					const expiry = prem.expires_at
						? `<t:${Math.floor(prem.expires_at / 1000)}:R>`
						: "Permanent";
					content += `${emoji.get("check")} \`${prem.guild_id}\` - ${expiry}\n`;
				});
			}

			container.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(content)
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
		} catch (error) {
			logger.error("PremiumCommand", "Error fetching stats:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} **Database Error:**\n${error.message}`);
		}
	}

	async _handleCleanup(client, message) {
		try {
			const result = db.premium.cleanupExpired();

			return this._sendSuccess(
				message,
				"Cleanup Complete",
				`${emoji.get("check")} **Cleanup operation successful!**\n\n👤 **User premiums removed:** ${result.usersRevoked}\n🏠 **Guild premiums removed:** ${result.guildsRevoked}\n${emoji.get("info")} **Total cleaned:** ${result.total}`
			);
		} catch (error) {
			logger.error("PremiumCommand", "Error during cleanup:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} **Cleanup Error:**\n${error.message}`);
		}
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

	_createHelpContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Premium Commands Help`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `${emoji.get("check")} **Available Commands:**
\`premium grant <user|guild> <id> [duration] [reason]\` - Grant premium
\`premium revoke <user|guild> <id>\` - Revoke premium
\`premium stats\` - View premium statistics
\`premium cleanup\` - Remove expired premiums

⏰ **Duration Examples:**
${emoji.get("info")} \`1d\` - 1 day
${emoji.get("info")} \`7d\` - 7 days  
${emoji.get("info")} \`30d\` - 30 days
${emoji.get("info")} \`perm\` - Permanent

📝 **Examples:**
${emoji.get("check")} \`premium grant user 123456789 30d VIP user\`
${emoji.get("check")} \`premium grant guild 987654321 perm Server boost\`
${emoji.get("check")} \`premium revoke user 123456789\``;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		return container;
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
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(description)
				)
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
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(description)
				)
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