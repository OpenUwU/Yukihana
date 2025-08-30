import { Database } from '#structures/classes/Database';
import {
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from 'discord.js';
import { config } from '#config/config';
import { db } from '#database/DatabaseManager';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';

export class AntiAbuse extends Database {
	constructor() {
		super(config.database.antiabuse);
		this.initTable();
		this.cooldownNotifications = new Map();
		this.mentionNotifications = new Map();
	}

	initTable() {
		this.exec('DROP TABLE IF EXISTS cooldowns');
		this.exec('DROP TABLE IF EXISTS mention_limits');

		this.exec(`
      CREATE TABLE IF NOT EXISTS cooldowns (
        user_id TEXT NOT NULL,
        command_name TEXT NOT NULL,
        last_used INTEGER,
        violation_count INTEGER DEFAULT 0,
        violation_timestamps TEXT DEFAULT '[]',
        last_cooldown_notification INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, command_name)
      )
    `);

		this.exec(`
      CREATE TABLE IF NOT EXISTS mention_limits (
        user_id TEXT PRIMARY KEY,
        last_mention INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

		logger.info('AntiAbuse', 'Anti-abuse tables initialized');
	}

	getCooldownData(userId, commandName) {
		return this.get(
			'SELECT * FROM cooldowns WHERE user_id = ? AND command_name = ?',
			[userId, commandName],
		);
	}

	checkCooldown(userId, command, messageOrInteraction) {
		const commandName = command.name;
		const baseCooldown = command.cooldown || 3;
		const hasPremium = db.hasAnyPremium(userId, null);
		const actualCooldown = hasPremium ? baseCooldown * 0.5 : baseCooldown;
		const cooldownMs = actualCooldown * 1000;

		const data = this.getCooldownData(userId, commandName);

		if (data && data.last_used) {
			const timeLeft = data.last_used + cooldownMs - Date.now();
			if (timeLeft > 0) {
				this.handleCooldownViolation(
					userId,
					commandName,
					messageOrInteraction,
				);
				return (timeLeft / 1000).toFixed(1);
			}
		}

		return null;
	}

	setCooldown(userId, command) {
		const commandName = command.name;
		const now = Date.now();

		const existing = this.getCooldownData(userId, commandName);

		if (existing) {
			this.exec(
				'UPDATE cooldowns SET last_used = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND command_name = ?',
				[now, userId, commandName],
			);
		} else {
			this.exec(
				'INSERT INTO cooldowns (user_id, command_name, last_used) VALUES (?, ?, ?)',
				[userId, commandName, now],
			);
		}
	}

	handleCooldownViolation(userId, commandName, messageOrInteraction) {
		const now = Date.now();
		const data = this.getCooldownData(userId, commandName);

		if (!data) return;

		let violations = [];
		try {
			violations = JSON.parse(data.violation_timestamps || '[]');
		} catch (e) {
			violations = [];
		}

		violations.push(now);
		violations = violations.filter(timestamp => now - timestamp < 20000);

		const newViolationCount = data.violation_count + 1;

		this.exec(
			'UPDATE cooldowns SET violation_count = ?, violation_timestamps = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND command_name = ?',
			[
				newViolationCount,
				JSON.stringify(violations),
				userId,
				commandName,
			],
		);

		if (violations.length >= 3) {
			this.blacklistUser(userId, messageOrInteraction);
		}
	}

	blacklistUser(userId, messageOrInteraction) {
		try {
			db.blacklistUser(
				userId,
				'Automated: Excessive cooldown violations (Anti-abuse system)',
			);

			if (messageOrInteraction) {
				this._sendBlacklistNotification(messageOrInteraction);
			}

			logger.warn(
				'AntiAbuse',
				`User ${userId} has been automatically blacklisted for excessive cooldown violations`,
			);
		} catch (error) {
			logger.error(
				'AntiAbuse',
				`Failed to blacklist user ${userId}`,
				error,
			);
		}
	}

	_sendBlacklistNotification(messageOrInteraction) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`${emoji.get('cross')} **Automatically Blacklisted**`,
				),
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			const content =
				`**${emoji.get('folder')} Anti-Abuse System**\n` +
				`├─ **Reason:** Excessive cooldown violations\n` +
				`├─ **Status:** Account access suspended\n` +
				`└─ **Appeal:** Contact support if this is a mistake\n\n` +
				`**${emoji.get('reset')} What happened?**\n` +
				`└─ You triggered cooldown violations too frequently`;

			const thumbnailUrl =
				config.assets?.defaultThumbnail ||
				config.assets?.defaultTrackArtwork;

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(thumbnailUrl),
				);

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			const payload = {
				components: [container],
				flags: MessageFlags.IsComponentsV2,
			};

			if (messageOrInteraction.reply) {
				messageOrInteraction.reply(payload);
			} else if (messageOrInteraction.editReply) {
				messageOrInteraction.editReply(payload);
			}
		} catch (e) {
			logger.error(
				'AntiAbuse',
				`Failed to send blacklist notification to user`,
				e,
			);
		}
	}

	sendCooldownNotification(messageOrInteraction, timeLeft, commandName) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`${emoji.get('cross')} **Command on Cooldown**`,
				),
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			const content =
				`**${emoji.get('folder')} Cooldown Information**\n` +
				`├─ **Command:** ${commandName}\n` +
				`├─ **Time Remaining:** ${timeLeft}s\n` +
				`└─ **Status:** Please wait before using this command again\n\n` +
				`**${emoji.get('add')} Pro Tip**\n` +
				`└─ Premium users get 50% reduced cooldowns`;

			const thumbnailUrl =
				config.assets?.defaultThumbnail ||
				config.assets?.defaultTrackArtwork;

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(thumbnailUrl),
				);

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
			);

			const payload = {
				components: [container],
				flags: MessageFlags.IsComponentsV2,
				ephemeral: true,
			};

			if (messageOrInteraction.reply) {
				messageOrInteraction.reply(payload);
			} else if (messageOrInteraction.followUp) {
				messageOrInteraction.reply(payload);
			}
		} catch (error) {
			logger.error(
				'AntiAbuse',
				`Failed to send cooldown notification`,
				error,
			);
		}
	}

	shouldShowCooldownNotification(userId, commandName) {
		const key = `${userId}:${commandName}`;
		const now = Date.now();
		const lastNotification = this.cooldownNotifications.get(key) || 0;

		if (now - lastNotification >= 5000) {
			this.cooldownNotifications.set(key, now);
			return true;
		}

		return false;
	}

	canShowMentionResponse(userId) {
		const now = Date.now();
		const data = this.get(
			'SELECT * FROM mention_limits WHERE user_id = ?',
			[userId],
		);

		if (!data || now - data.last_mention >= 10000) {
			if (data) {
				this.exec(
					'UPDATE mention_limits SET last_mention = ? WHERE user_id = ?',
					[now, userId],
				);
			} else {
				this.exec(
					'INSERT INTO mention_limits (user_id, last_mention) VALUES (?, ?)',
					[userId, now],
				);
			}
			return true;
		}

		return false;
	}

	resetCooldown(userId, commandName) {
		this.exec(
			'DELETE FROM cooldowns WHERE user_id = ? AND command_name = ?',
			[userId, commandName],
		);
		const key = `${userId}:${commandName}`;
		this.cooldownNotifications.delete(key);
	}

	resetAll() {
		this.exec('DELETE FROM cooldowns');
		this.exec('DELETE FROM mention_limits');
		this.cooldownNotifications.clear();
		this.mentionNotifications.clear();
	}

	getUserStats(userId, command) {
		const data = this.getCooldownData(userId, command.name);
		const baseCooldown = command.cooldown || 3;
		const hasPremium = db.hasAnyPremium(userId, null);
		const currentCooldown = hasPremium ? baseCooldown * 0.5 : baseCooldown;

		return {
			baseCooldown,
			currentCooldown,
			violations: data ? data.violation_count : 0,
			hasPremium,
		};
	}

	cleanupOldData() {
		const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

		this.exec('DELETE FROM cooldowns WHERE last_used < ?', [oneDayAgo]);
		this.exec('DELETE FROM mention_limits WHERE last_mention < ?', [
			oneDayAgo,
		]);

		for (const [key, timestamp] of this.cooldownNotifications.entries()) {
			if (Date.now() - timestamp > 300000) {
				this.cooldownNotifications.delete(key);
			}
		}
	}
}

export const antiAbuse = new AntiAbuse();
