import { Database } from '#structures/classes/Database';
import { config } from "#config/config";
import { logger } from "#utils/logger";

const HISTORY_LIMIT = 25;
const USER_PREFIX_LIMIT = 3;

export class User extends Database {
  constructor() {
    super(config.database.user);
    this.initTable();
  }

  initTable() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        no_prefix BOOLEAN DEFAULT FALSE,
        no_prefix_expiry INTEGER DEFAULT NULL,
        custom_prefixes TEXT DEFAULT '[]',
        blacklisted BOOLEAN DEFAULT FALSE,
        blacklist_reason TEXT DEFAULT NULL,
        history TEXT DEFAULT '[]',
        spotify_profile_url TEXT DEFAULT NULL,
        spotify_display_name TEXT DEFAULT NULL,
        spotify_linked_at TIMESTAMP DEFAULT NULL,
        tos_accepted BOOLEAN DEFAULT FALSE,
        tos_accepted_at TIMESTAMP DEFAULT NULL,
        tos_version TEXT DEFAULT NULL,
        pp_accepted BOOLEAN DEFAULT FALSE,
        pp_accepted_at TIMESTAMP DEFAULT NULL,
        pp_version TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('UserDatabase', 'User table initialized');
  }

  getUser(userId) {
    return this.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  hasAcceptedTOS(userId) {
    const user = this.getUser(userId);
    return user && user.tos_accepted === 1;
  }

  hasAcceptedPP(userId) {
    const user = this.getUser(userId);
    return user && user.pp_accepted === 1;
  }

  hasAcceptedBoth(userId) {
    return this.hasAcceptedTOS(userId) && this.hasAcceptedPP(userId);
  }

  acceptTOS(userId, version = "v1.0") {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET tos_accepted = 1, tos_accepted_at = CURRENT_TIMESTAMP, tos_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [version, userId]
    );
  }

  acceptPP(userId, version = "v1.0") {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET pp_accepted = 1, pp_accepted_at = CURRENT_TIMESTAMP, pp_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [version, userId]
    );
  }

  revokeAcceptances(userId) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET tos_accepted = 0, tos_accepted_at = NULL, tos_version = NULL, pp_accepted = 0, pp_accepted_at = NULL, pp_version = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }

  setNoPrefix(userId, enabled, expiryTimestamp = null) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET no_prefix = ?, no_prefix_expiry = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [enabled ? 1 : 0, expiryTimestamp, userId]
    );
  }

  hasNoPrefix(userId) {
    const user = this.getUser(userId);
    if (!user || !user.no_prefix) return false;
    if (!user.no_prefix_expiry) return true;

    if (user.no_prefix_expiry > Date.now()) {
      return true;
    } else {
      this.setNoPrefix(userId, false, null);
      return false;
    }
  }

  getUserPrefixes(userId) {
    const user = this.getUser(userId);
    if (!user || !user.custom_prefixes) return [];
    try {
      return JSON.parse(user.custom_prefixes);
    } catch (e) {
      logger.error("UserDB", `Could not parse custom_prefixes for user ${userId}`);
      return [];
    }
  }

  setUserPrefixes(userId, prefixes) {
    this.ensureUser(userId);
    const limitedPrefixes = prefixes.slice(0, USER_PREFIX_LIMIT);
    return this.exec(
      'UPDATE users SET custom_prefixes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(limitedPrefixes), userId]
    );
  }

  blacklistUser(userId, reason = 'No reason provided') {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET blacklisted = 1, blacklist_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [reason, userId]
    );
  }

  unblacklistUser(userId) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET blacklisted = 0, blacklist_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }

  isBlacklisted(userId) {
    const user = this.getUser(userId);
    if (!user || !user.blacklisted) return false;
    return { blacklisted: true, reason: user.blacklist_reason || 'No reason provided' };
  }

  ensureUser(userId) {
    const user = this.getUser(userId);
    if (!user) {
      try {
        this.exec('INSERT INTO users (id) VALUES (?)', [userId]);
        return this.getUser(userId);
      } catch (e) {
        logger.error('UserDatabase', 'Error creating user:', e);
        throw e;
      }
    }
    return user;
  }

  addTrackToHistory(userId, trackInfo) {
    try {
      this.ensureUser(userId);
    } catch (e) {
      logger.error('UserDatabase', 'Error in ensureUser:', e);
      return;
    }

    if (!trackInfo || !trackInfo.identifier) {
      return;
    }

    let history = [];
    try {
      const user = this.getUser(userId);
      if (user && user.history) {
        history = JSON.parse(user.history);
      }
    } catch(e) {
      logger.error("UserDB", `Could not parse history for user ${userId}:`, e);
      history = [];
    }

    const historyEntry = {
      identifier: trackInfo.identifier,
      title: trackInfo.title || 'Unknown Track',
      author: trackInfo.author || 'Unknown',
      uri: trackInfo.uri || null,
      duration: trackInfo.duration || null,
      sourceName: trackInfo.sourceName || null,
      artworkUrl: trackInfo.artworkUrl || null,
      addedAt: Date.now()
    };

    history = history.filter(t => t && t.identifier !== historyEntry.identifier);
    history.unshift(historyEntry);
    history = history.slice(0, HISTORY_LIMIT);

    try {
      this.exec(
        'UPDATE users SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(history), userId]
      );
    } catch (e) {
      logger.error('UserDatabase', 'Error updating history:', e);
    }
  }

  getHistory(userId) {
    const user = this.getUser(userId);
    if (!user || !user.history) return [];
    try {
      return JSON.parse(user.history);
    } catch (e) {
      logger.error('UserDatabase', `Failed to parse history for user ${userId}`, e);
      return [];
    }
  }

  cleanupHistory(userId) {
    const user = this.getUser(userId);
    if (!user || !user.history) return;

    try {
      let history = JSON.parse(user.history);

      history = history
        .filter(track => track && track.identifier)
        .map(track => ({
          identifier: track.identifier,
          title: track.title || 'Unknown Track',
          author: track.author || 'Unknown',
          uri: track.uri || null,
          duration: track.duration || null,
          sourceName: track.sourceName || null,
          artworkUrl: track.artworkUrl || null,
          addedAt: track.addedAt || Date.now()
        }));

      this.exec('UPDATE users SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(history), userId]);

      logger.info('UserDB', `Cleaned up history for user ${userId}`);
    } catch (e) {
      logger.error('UserDB', `Failed to cleanup history for user ${userId}`, e);
    }
  }

  setUserHistory(userId, history) {
    this.ensureUser(userId);
    const limitedHistory = history.slice(0, HISTORY_LIMIT);
    return this.exec(
      'UPDATE users SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(limitedHistory), userId]
    );
  }

  linkSpotifyProfile(userId, profileUrl, displayName = null) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET spotify_profile_url = ?, spotify_display_name = ?, spotify_linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [profileUrl, displayName, userId]
    );
  }

  getSpotifyProfile(userId) {
    const user = this.getUser(userId);
    if (!user || !user.spotify_profile_url) return null;

    return {
      profileUrl: user.spotify_profile_url,
      displayName: user.spotify_display_name,
      linkedAt: user.spotify_linked_at
    };
  }

  unlinkSpotifyProfile(userId) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET spotify_profile_url = NULL, spotify_display_name = NULL, spotify_linked_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }
}