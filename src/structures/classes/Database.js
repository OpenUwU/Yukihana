import BetterSQLite3 from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '#utils/logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Database {
	constructor(dbPath) {
		this.path = path.resolve(__dirname, '..', '..', dbPath);

		fs.ensureDirSync(path.dirname(this.path));

		try {
			this.db = new BetterSQLite3(this.path, {
				fileMustExist: false,
				verbose:
					process.env.NODE_ENV === 'development'
						? msg => logger.debug('Database', msg)
						: null,
			});

			this.db.pragma('journal_mode   =WAL');
			this.db.pragma('synchronous   =NORMAL');
		} catch (error) {
			logger.error(
				'Database',
				`Failed to connect to ${path.basename(dbPath)}`,
				error,
			);
			throw error;
		}
	}

	exec(sql, params = []) {
		try {
			return this.db.prepare(sql).run(params);
		} catch (error) {
			logger.error('Database', `Failed to execute SQL: ${sql}`, error);
			throw error;
		}
	}

	get(sql, params = []) {
		try {
			return this.db.prepare(sql).get(params);
		} catch (error) {
			logger.error('Database', `Failed to get row: ${sql}`, error);
			throw error;
		}
	}

	all(sql, params = []) {
		try {
			return this.db.prepare(sql).all(params);
		} catch (error) {
			logger.error('Database', `Failed to get all rows: ${sql}`, error);
			throw error;
		}
	}

	prepare(sql) {
		try {
			return this.db.prepare(sql);
		} catch (error) {
			logger.error(
				'Database',
				`Failed to prepare statement: ${sql}`,
				error,
			);
			throw error;
		}
	}

	close() {
		try {
			this.db.close();
			logger.info(
				'Database',
				`Closed connection to ${path.basename(this.path)}`,
			);
		} catch (error) {
			logger.error(
				'Database',
				`Failed to close connection to ${path.basename(this.path)}`,
				error,
			);
		}
	}
}
