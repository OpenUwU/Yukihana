import { Database } from '#structures/classes/Database';

import { config } from '#config/config';
import { logger } from '#utils/logger';


export class Premium extends Database {
  constructor() {
    super(config.database.premium);
    this.initTables();
  }

  initTables() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS user_premium (
        user_id TEXT PRIMARY KEY,
        premium_type TEXT DEFAULT 'user',
        granted_by TEXT NOT NULL,
        granted_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        expires_at INTEGER DEFAULT NULL,
        reason TEXT DEFAULT 'No reason provided',
        active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    this.exec(`
      CREATE TABLE IF NOT EXISTS guild_premium (
        guild_id TEXT PRIMARY KEY,
        premium_type TEXT DEFAULT 'guild',
        granted_by TEXT NOT NULL,
        granted_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        expires_at INTEGER DEFAULT NULL,
        reason TEXT DEFAULT 'No reason provided',
        active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    logger.success('PremiumDatabase', 'Premium tables initialized successfully');
  }

  grantUserPremium(userId, grantedBy, expiresAt   =null, reason   ='Premium granted') {
    const now   =Date.now();
    return this.exec(
      `INSERT OR REPLACE INTO user_premium 
       (user_id, granted_by, granted_at, expires_at, reason, active, updated_at) 
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [userId, grantedBy, now, expiresAt, reason, now],
    );
  }

  grantGuildPremium(guildId, grantedBy, expiresAt   =null, reason   ='Premium granted') {
    const now   =Date.now();
    return this.exec(
      `INSERT OR REPLACE INTO guild_premium 
       (guild_id, granted_by, granted_at, expires_at, reason, active, updated_at) 
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [guildId, grantedBy, now, expiresAt, reason, now],
    );
  }

  revokeUserPremium(userId) {
    return this.exec(
      'UPDATE user_premium SET active   =0, updated_at   =? WHERE user_id   =? AND active   =1',
      [Date.now(), userId],
    );
  }

  revokeGuildPremium(guildId) {
    return this.exec(
      'UPDATE guild_premium SET active   =0, updated_at   =? WHERE guild_id   =? AND active   =1',
      [Date.now(), guildId],
    );
  }

  isUserPremium(userId) {
    const premium   =this.get(
      `SELECT * FROM user_premium 
       WHERE user_id   =? AND active   =1 
       AND (expires_at IS NULL OR expires_at > ?)`,
      [userId, Date.now()],
    );

    if (!premium) return false;

    return {
      type: 'user',
      grantedBy: premium.granted_by,
      grantedAt: premium.granted_at,
      expiresAt: premium.expires_at,
      reason: premium.reason,
      isPermanent: premium.expires_at   ===null,
    };
  }


  isGuildPremium(guildId) {
    const premium   =this.get(
      `SELECT * FROM guild_premium 
       WHERE guild_id   =? AND active   =1 
       AND (expires_at IS NULL OR expires_at > ?)`,
      [guildId, Date.now()],
    );

    if (!premium) return false;

    return {
      type: 'guild',
      grantedBy: premium.granted_by,
      grantedAt: premium.granted_at,
      expiresAt: premium.expires_at,
      reason: premium.reason,
      isPermanent: premium.expires_at   ===null,
    };
  }


  hasAnyPremium(userId, guildId) {
    const userPrem   =this.isUserPremium(userId);
    if (userPrem) return userPrem;

    const guildPrem   =this.isGuildPremium(guildId);
    if (guildPrem) return guildPrem;

    return false;
  }


  getAllUserPremiums() {
    return this.all(
      `SELECT * FROM user_premium 
       WHERE active   =1 
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY granted_at DESC`,
      [Date.now()],
    );
  }


  getAllGuildPremiums() {
    return this.all(
      `SELECT * FROM guild_premium 
       WHERE active   =1 
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY granted_at DESC`,
      [Date.now()],
    );
  }


  getExpiredPremiums() {
    const expiredUsers   =this.all(
      `SELECT * FROM user_premium 
       WHERE active   =1 AND expires_at IS NOT NULL AND expires_at <= ?`,
      [Date.now()],
    );

    const expiredGuilds   =this.all(
      `SELECT * FROM guild_premium 
       WHERE active   =1 AND expires_at IS NOT NULL AND expires_at <= ?`,
      [Date.now()],
    );

    return { users: expiredUsers, guilds: expiredGuilds };
  }


  cleanupExpired() {
    const now   =Date.now();

    const userResult   =this.exec(
      `UPDATE user_premium SET active   =0, updated_at   =? 
       WHERE active   =1 AND expires_at IS NOT NULL AND expires_at <= ?`,
      [now, now],
    );

    const guildResult   =this.exec(
      `UPDATE guild_premium SET active   =0, updated_at   =? 
       WHERE active   =1 AND expires_at IS NOT NULL AND expires_at <= ?`,
      [now, now],
    );

    return {
      usersRevoked: userResult.changes,
      guildsRevoked: guildResult.changes,
      total: userResult.changes + guildResult.changes,
    };
  }


  getStats() {
    const now   =Date.now();

    const activeUsers   =this.get(
      `SELECT COUNT(*) as count FROM user_premium 
       WHERE active   =1 AND (expires_at IS NULL OR expires_at > ?)`,
      [now],
    ).count;

    const activeGuilds   =this.get(
      `SELECT COUNT(*) as count FROM guild_premium 
       WHERE active   =1 AND (expires_at IS NULL OR expires_at > ?)`,
      [now],
    ).count;

    const totalUsers   =this.get('SELECT COUNT(*) as count FROM user_premium').count;
    const totalGuilds   =this.get('SELECT COUNT(*) as count FROM guild_premium').count;

    const expiredUsers   =this.get(
      `SELECT COUNT(*) as count FROM user_premium 
       WHERE active   =0 OR (expires_at IS NOT NULL AND expires_at <= ?)`,
      [now],
    ).count;

    const expiredGuilds   =this.get(
      `SELECT COUNT(*) as count FROM guild_premium 
       WHERE active   =0 OR (expires_at IS NOT NULL AND expires_at <= ?)`,
      [now],
    ).count;

    return {
      active: {
        users: activeUsers,
        guilds: activeGuilds,
        total: activeUsers + activeGuilds,
      },
      total: {
        users: totalUsers,
        guilds: totalGuilds,
        total: totalUsers + totalGuilds,
      },
      expired: {
        users: expiredUsers,
        guilds: expiredGuilds,
        total: expiredUsers + expiredGuilds,
      },
    };
  }


  extendPremium(type, id, additionalTime) {
    const table   =type   ==='user' ? 'user_premium' : 'guild_premium';
    const idColumn   =type   ==='user' ? 'user_id' : 'guild_id';

    const current   =this.get(
      `SELECT * FROM ${table} WHERE ${idColumn}   =? AND active   =1`,
      [id],
    );

    if (!current) return false;

    let newExpiresAt;
    if (current.expires_at   ===null) {
      newExpiresAt   =Date.now() + additionalTime;
    } else {
      newExpiresAt   =Math.max(current.expires_at, Date.now()) + additionalTime;
    }

    this.exec(
      `UPDATE ${table} SET expires_at   =?, updated_at   =? WHERE ${idColumn}   =?`,
      [newExpiresAt, Date.now(), id],
    );

    return type   ==='user' ? this.isUserPremium(id) : this.isGuildPremium(id);
  }


  getUserPremium(userId) {
    return this.get(
      'SELECT * FROM user_premium WHERE user_id   =?',
      [userId],
    );
  }


  getGuildPremium(guildId) {
    return this.get(
      'SELECT * FROM guild_premium WHERE guild_id   =?',
      [guildId],
    );
  }


  deleteUserPremium(userId) {
    return this.exec('DELETE FROM user_premium WHERE user_id   =?', [userId]);
  }


  deleteGuildPremium(guildId) {
    return this.exec('DELETE FROM guild_premium WHERE guild_id   =?', [guildId]);
  }
}
