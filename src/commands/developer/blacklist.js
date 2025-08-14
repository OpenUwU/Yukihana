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

class BlacklistCommand extends Command {
	constructor() {
		super({
			name: "blacklist",
			description: "Manage blacklisted users and guilds (Owner Only)",
			usage: "blacklist <add|remove|check|stats> [type/id] [id] [reason]",
			aliases: ["bl"],
			category: "developer",
			examples: [
				"blacklist add user 123456789 Spam",
				"blacklist add guild 987654321 ToS violation",
				"blacklist remove 123456789",
				"blacklist check @user"
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
				case "add":
					return await this._handleAdd(client, message, args.slice(1));
				case "remove":
					return await this._handleRemove(client, message, args.slice(1));
				case "check":
					return await this._handleCheck(client, message, args.slice(1));
				default:
					return this._sendError(message, "Invalid Action", `Unknown action: ${action}. Use add, remove, or check.`);
			}
		} catch (error) {
			logger.error("BlacklistCommand", "Blacklist command error:", error);
			return this._sendError(message, "Error", `An unexpected error occurred: ${error.message}`);
		}
	}

	async _handleAdd(client, message, args) {
		if (args.length < 2) {
			return this._sendError(
				message, 
				"Usage Error", 
				`${emoji.get("info")} **Command Format:**\nblacklist add <user|guild> <id> [reason]\n\n${emoji.get("info")} **Default reason:** Blacklisted by owner`
			);
		}

		const type = args[0].toLowerCase();
		let id = args[1];

		if (id.startsWith("<@") && id.endsWith(">")) {
			id = id.slice(2, -1);
			if (id.startsWith("!")) id = id.slice(1);
		}

		const reason = args.slice(2).join(" ") || "Blacklisted by owner";

		if (!["user", "guild"].includes(type)) {
			return this._sendError(message, "Invalid Type", `${emoji.get("cross")} Type must be either **user** or **guild**.`);
		}

		try {
			let result;
			let alreadyBlacklisted = false;

			if (type === "user") {
				alreadyBlacklisted = db.isUserBlacklisted(id);
				if (!alreadyBlacklisted) {
					result = db.blacklistUser(id, reason);
				}
			} else {
				alreadyBlacklisted = db.isGuildBlacklisted(id);
				if (!alreadyBlacklisted) {
					result = db.blacklistGuild(id, reason);
				}
			}

			if (alreadyBlacklisted) {
				return this._sendError(message, "Already Blacklisted", `${emoji.get("cross")} ${type === "user" ? "User" : "Guild"} \`${id}\` is already blacklisted.`);
			}

			if (result && result.changes > 0) {
				const typeIcon = type === "user" ? "👤" : "🏠";
				return this._sendSuccess(
					message,
					"Blacklisted Successfully",
					`${emoji.get("check")} **Successfully blacklisted ${type}!**\n\n${typeIcon} **Target:** \`${id}\`\n📝 **Reason:** ${reason}`
				);
			} else {
				return this._sendError(message, "Blacklist Failed", `${emoji.get("cross")} Unable to blacklist ${type} \`${id}\`.`);
			}
		} catch (error) {
			logger.error("BlacklistCommand", "Error adding to blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} **Database Error:**\n${error.message}`);
		}
	}

	async _handleRemove(client, message, args) {
		if (args.length < 1) {
			return this._sendError(message, "Usage Error", `${emoji.get("info")} **Command Format:**\nblacklist remove <id>`);
		}

		let id = args[0];

		if (id.startsWith("<@") && id.endsWith(">")) {
			id = id.slice(2, -1);
			if (id.startsWith("!")) id = id.slice(1);
		}

		try {
			const isUserBlacklisted = db.isUserBlacklisted(id);
			const isGuildBlacklisted = db.isGuildBlacklisted(id);

			if (!isUserBlacklisted && !isGuildBlacklisted) {
				return this._sendError(
					message, 
					"Not Blacklisted", 
					`${emoji.get("cross")} ID \`${id}\` is not blacklisted.`
				);
			}

			let result;
			let type;

			if (isUserBlacklisted) {
				result = db.unblacklistUser(id);
				type = "user";
			} else {
				result = db.unblacklistGuild(id);
				type = "guild";
			}

			if (result && result.changes > 0) {
				const typeIcon = type === "user" ? "👤" : "🏠";
				return this._sendSuccess(
					message,
					"Removed from Blacklist",
					`${emoji.get("check")} **Successfully removed ${type} from blacklist!**\n\n${typeIcon} **Target:** \`${id}\``
				);
			} else {
				return this._sendError(
					message, 
					"Remove Failed", 
					`${emoji.get("cross")} Failed to remove \`${id}\` from blacklist.`
				);
			}
		} catch (error) {
			logger.error("BlacklistCommand", "Error removing from blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} **Database Error:**\n${error.message}`);
		}
	}

	async _handleCheck(client, message, args) {
		if (args.length < 1) {
			return this._sendError(message, "Usage Error", `${emoji.get("info")} **Command Format:**\nblacklist check <id>`);
		}

		let id = args[0];

		if (id.startsWith("<@") && id.endsWith(">")) {
			id = id.slice(2, -1);
			if (id.startsWith("!")) id = id.slice(1);
		}

		try {
			const isUserBlacklisted = db.isUserBlacklisted(id);
			const isGuildBlacklisted = db.isGuildBlacklisted(id);

			if (!isUserBlacklisted && !isGuildBlacklisted) {
				return this._sendSuccess(
					message,
					"Not Blacklisted",
					`${emoji.get("check")} **ID \`${id}\` is not blacklisted.**\n\n${emoji.get("info")} This ID is clean and can use the bot normally.`
				);
			}

			const type = isUserBlacklisted ? "user" : "guild";
			const typeIcon = type === "user" ? "👤" : "🏠";

			return this._sendError(
				message,
				"Blacklisted",
				`${emoji.get("cross")} **${type === "user" ? "User" : "Guild"} is blacklisted!**\n\n${typeIcon} **Target:** \`${id}\`\n${emoji.get("info")} **Type:** ${type.charAt(0).toUpperCase() + type.slice(1)}`
			);
		} catch (error) {
			logger.error("BlacklistCommand", "Error checking blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} **Database Error:**\n${error.message}`);
		}
	}

	_createHelpContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### ${emoji.get("info")} Blacklist Commands Help`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = `${emoji.get("cross")} **Available Commands:**
\`blacklist add <user|guild> <id> [reason]\` - Add to blacklist
\`blacklist remove <id>\` - Remove from blacklist
\`blacklist check <id>\` - Check blacklist status

${emoji.get("info")} **ID Formats:**
${emoji.get("check")} User ID: \`123456789\`
${emoji.get("check")} User mention: \`@user\`
${emoji.get("check")} Guild ID: \`987654321\`

📝 **Examples:**
${emoji.get("cross")} \`blacklist add user 123456789 Spam\`
${emoji.get("cross")} \`blacklist add guild 987654321 ToS violation\`
${emoji.get("check")} \`blacklist remove 123456789\`
${emoji.get("info")} \`blacklist check @user\``;

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

export default new BlacklistCommand();