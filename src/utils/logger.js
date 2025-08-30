import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';

import { config } from '#config/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../logs');

class Logger {
	constructor() {
		this.infoColor = chalk.hex(config.colors.info);
		this.successColor = chalk.hex(config.colors.success);
		this.warningColor = chalk.hex(config.colors.warning);
		this.errorColor = chalk.hex(config.colors.error);

		this.initLogFiles();
	}

	initLogFiles() {
		try {
			if (!fs.existsSync(LOG_DIR)) {
				fs.mkdirSync(LOG_DIR, { recursive: true });
				console.log(`Created log directory at ${LOG_DIR}`);
			}

			this.logFilePath = path.join(LOG_DIR, 'bot.log');
			this.errorLogFilePath = path.join(LOG_DIR, 'error.log');

			this.rotateLogFileIfNeeded(this.logFilePath);
			this.rotateLogFileIfNeeded(this.errorLogFilePath);

			this.writeToLogFile(
				this.logFilePath,
				`========== Log started at ${new Date().toISOString()} ==========`,
			);
		} catch (error) {
			console.error('Failed to initialize log files:', error);
		}
	}

	rotateLogFileIfNeeded(filePath) {
		try {
			if (fs.existsSync(filePath)) {
				const stats = fs.statSync(filePath);
				const fileSizeInMB = stats.size / (1024 * 1024);

				if (fileSizeInMB > 5) {
					const timestamp = new Date()
						.toISOString()
						.replace(/[.:]/g, '-');
					const backupPath = `${filePath}.${timestamp}`;
					fs.renameSync(filePath, backupPath);
					console.log(
						`Rotated log file: ${filePath} -> ${backupPath}`,
					);
				}
			}
		} catch (error) {
			console.error(`Failed to rotate log file ${filePath}:`, error);
		}
	}

	writeToLogFile(filePath, content) {
		try {
			fs.appendFileSync(filePath, `${content}\n`);
		} catch (error) {
			console.error(`Failed to write to log file ${filePath}:`, error);
		}
	}

	async sendWebhook(level, context, message, error = null) {
		if (!config.webhook?.enabled || !config.webhook?.url) return;

		const levelConfig = config.webhook.levels?.[level.toLowerCase()];
		if (!levelConfig?.enabled) return;

		try {
			const colors = {
				info: 3447003,
				success: 3066993,
				warning: 15844367,
				error: 15158332,
				debug: 10181046,
			};

			const embed = {
				title: `${level.toUpperCase()} Log`,
				color: colors[level.toLowerCase()] || 7506394,
				fields: [
					{
						name: 'Context',
						value: `\`${context}\``,
						inline: true,
					},
					{
						name: 'Message',
						value:
							message.length > 1024
								? `${message.substring(0, 1021)}...`
								: message,
						inline: false,
					},
				],
				timestamp: new Date().toISOString(),
				footer: {
					text: config.watermark || 'Logger',
				},
			};

			if (error) {
				embed.fields.push({
					name: 'Error Details',
					value: `\`\`\`\n${(
						error.stack || error.toString()
					).substring(0, 1000)}\n\`\`\``,
					inline: false,
				});
			}

			const payload = {
				embeds: [embed],
				username: config.webhook.username || 'Bot Logger',
				avatar_url: config.webhook.avatarUrl,
			};

			await fetch(config.webhook.url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});
		} catch (webhookError) {
			console.error('Failed to send webhook:', webhookError);
		}
	}

	formatLogMessage(level, context, message) {
		const timestamp = new Date().toISOString();
		return `[${timestamp}] [${level}] [${context}] ${message}`;
	}

	get timestamp() {
		return new Date().toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	}

	async info(context, message) {
		console.log(
			chalk.blue(`[${this.timestamp}]`),
			chalk.bold(this.infoColor(`[${context}]`)),
			chalk.whiteBright(message),
		);

		this.writeToLogFile(
			this.logFilePath,
			this.formatLogMessage('INFO', context, message),
		);

		await this.sendWebhook('info', context, message);
	}

	async success(context, message) {
		console.log(
			chalk.green(`[${this.timestamp}]`),
			chalk.bold(this.successColor(`[${context}]`)),
			chalk.whiteBright(message),
		);

		this.writeToLogFile(
			this.logFilePath,
			this.formatLogMessage('SUCCESS', context, message),
		);

		await this.sendWebhook('success', context, message);
	}

	async warn(context, message) {
		console.log(
			chalk.yellow(`[${this.timestamp}]`),
			chalk.bold(this.warningColor(`[${context}]`)),
			chalk.whiteBright(message),
		);

		this.writeToLogFile(
			this.logFilePath,
			this.formatLogMessage('WARN', context, message),
		);

		await this.sendWebhook('warning', context, message);
	}

	async error(context, message, error) {
		console.log(
			chalk.red(`[${this.timestamp}]`),
			chalk.bold(this.errorColor(`[${context}]`)),
			chalk.red(message),
		);

		if (error) {
			console.error(error);
		}

		this.writeToLogFile(
			this.logFilePath,
			this.formatLogMessage('ERROR', context, message),
		);

		let errorLog = this.formatLogMessage('ERROR', context, message);
		if (error) {
			errorLog += `\nStack trace: ${error.stack || error}`;
		}
		this.writeToLogFile(this.errorLogFilePath, errorLog);

		await this.sendWebhook('error', context, message, error);
	}

	async debug(context, message) {
		if (process.env.NODE_ENV === 'development' || config.debug) {
			console.log(
				chalk.magenta(`[${this.timestamp}]`),
				chalk.bold.magenta(`[${context}]`),
				chalk.whiteBright(message),
			);

			this.writeToLogFile(
				this.logFilePath,
				this.formatLogMessage('DEBUG', context, message),
			);

			await this.sendWebhook('debug', context, message);
		}
	}
}

export const logger = new Logger();
