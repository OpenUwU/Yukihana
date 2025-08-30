import { Database } from '#structures/classes/Database';
import { config } from "#config/config";
import { logger } from "#utils/logger";

const HISTORY_LIMIT   =10;
const USER_PREFIX_LIMIT   =3;

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);


    logger.info('UserDatabase', 'User table initialized');
  }

  getUser(userId) {
    return this.get('SELECT * FROM users WHERE id   =?', [userId]);
  }


  setNoPrefix(userId, enabled, expiryTimestamp   =null) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET no_prefix   =?, no_prefix_expiry   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
      [enabled ? 1 : 0, expiryTimestamp, userId]
    );
  }

  hasNoPrefix(userId) {
    const user   =this.getUser(userId);
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
    const user   =this.getUser(userId);
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
    const limitedPrefixes   =prefixes.slice(0, USER_PREFIX_LIMIT);
    return this.exec(
      'UPDATE users SET custom_prefixes   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
      [JSON.stringify(limitedPrefixes), userId]
    );
  }


  blacklistUser(userId, reason   ='No reason provided') {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET blacklisted   =1, blacklist_reason   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
      [reason, userId]
    );
  }

  unblacklistUser(userId) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET blacklisted   =0, blacklist_reason   =NULL, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
      [userId]
    );
  }

  isBlacklisted(userId) {
    const user   =this.getUser(userId);
    if (!user || !user.blacklisted) return false;
    return { blacklisted: true, reason: user.blacklist_reason || 'No reason provided' };
  }

  ensureUser(userId) {
    logger.debug('UserDatabase', '  ===ENSURE USER DEBUG   ===');
    logger.debug('UserDatabase', `User ID: ${userId}`);
    logger.debug('UserDatabase', `User ID type: ${typeof userId}`);
    logger.debug('UserDatabase', `User ID length: ${userId?.length}`);

    const user   =this.getUser(userId);
    logger.debug('UserDatabase', `Existing user found: ${!!user}`);

    if (!user) {
      logger.debug('UserDatabase', 'Creating new user...');
      try {
        const insertResult   =this.exec('INSERT INTO users (id) VALUES (?)', [userId]);
        logger.debug('UserDatabase', `Insert result: ${JSON.stringify(insertResult)}`);
        logger.debug('UserDatabase', `Insert changes: ${insertResult?.changes}`);

        const newUser   =this.getUser(userId);
        logger.debug('UserDatabase', `New user created: ${!!newUser}`);
        logger.debug('UserDatabase', `New user data: ${JSON.stringify(newUser)}`);
        logger.debug('UserDatabase', '  ===END ENSURE USER DEBUG   ===');
        return newUser;
      } catch (e) {
        logger.error('UserDatabase', 'Error creating user:', e);
        logger.debug('UserDatabase', '  ===END ENSURE USER DEBUG (ERROR)   ===');
        throw e;
      }
    }

    logger.debug('UserDatabase', '  ===END ENSURE USER DEBUG (EXISTING)   ===');
    return user;
  }


  addTrackToHistory(userId, trackInfo) {
    logger.debug('UserDatabase', '  ===ADD TRACK TO HISTORY DEBUG   ===');
    logger.debug('UserDatabase', `User ID: ${userId}`);
    logger.debug('UserDatabase', `Track info: ${JSON.stringify(trackInfo)}`);

    try {
      const ensureResult   =this.ensureUser(userId);
      logger.debug('UserDatabase', `Ensure user result: ${!!ensureResult}`);
    } catch (e) {
      logger.error('UserDatabase', 'Error in ensureUser:', e);
      return;
    }

    if (!trackInfo || !trackInfo.identifier) {
      logger.debug('UserDatabase', 'Invalid track info, aborting');
      return;
    }

    let history   =[];
    try {
      const user   =this.getUser(userId);
      logger.debug('UserDatabase', `User after ensure: ${!!user}`);
      logger.debug('UserDatabase', `User history field: ${user?.history}`);

      if (user && user.history) {
        history   =JSON.parse(user.history);
      }
      logger.debug('UserDatabase', `Parsed history length: ${history.length}`);
    } catch(e) {
      logger.error("UserDB", `Could not parse history for user ${userId}:`, e);
      history   =[];
    }

    const historyEntry   ={
      identifier: trackInfo.identifier,
      title: trackInfo.title || 'Unknown Track',
      author: trackInfo.author || 'Unknown',
      uri: trackInfo.uri || null,
      duration: trackInfo.duration || null,
      sourceName: trackInfo.sourceName || null,
      artworkUrl: trackInfo.artworkUrl || null,
      addedAt: Date.now()
    };

    logger.debug('UserDatabase', `History entry to add: ${JSON.stringify(historyEntry)}`);

    const beforeLength   =history.length;
    history   =history.filter(t   => t && t.identifier   !==historyEntry.identifier);
    history.unshift(historyEntry);
    history   =history.slice(0, HISTORY_LIMIT);

    logger.debug('UserDatabase', `History length before: ${beforeLength}`);
    logger.debug('UserDatabase', `History length after: ${history.length}`);

    try {
      const updateResult   =this.exec(
        'UPDATE users SET history   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
        [JSON.stringify(history), userId]
      );

      logger.debug('UserDatabase', `Update result: ${JSON.stringify(updateResult)}`);
      logger.debug('UserDatabase', `Update changes: ${updateResult?.changes}`);

      const verifyUser   =this.getUser(userId);
      logger.debug('UserDatabase', `Verification - user exists: ${!!verifyUser}`);
      logger.debug('UserDatabase', `Verification - history field: ${verifyUser?.history?.substring(0, 100) + '...'}`);

      if (verifyUser?.history) {
        const verifyHistory   =JSON.parse(verifyUser.history);
        logger.debug('UserDatabase', `Verification - parsed history length: ${verifyHistory.length}`);
        logger.debug('UserDatabase', `Verification - first track: ${verifyHistory[0]?.title}`);
      }

    } catch (e) {
      logger.error('UserDatabase', 'Error updating history:', e);
    }

    logger.debug('UserDatabase', '  ===END ADD TRACK TO HISTORY DEBUG   ===');
  }

  getHistory(userId) {
    const user   =this.getUser(userId);
    if (!user || !user.history) return [];
    try {
      return JSON.parse(user.history);
    } catch (e) {
      logger.error('UserDatabase', `Failed to parse history for user ${userId}`, e);
      return [];
    }
  }


  cleanupHistory(userId) {
    const user   =this.getUser(userId);
    if (!user || !user.history) return;

    try {
      let history   =JSON.parse(user.history);

      history   =history
        .filter(track   => track && track.identifier)
        .map(track   => ({
          identifier: track.identifier,
          title: track.title || 'Unknown Track',
          author: track.author || 'Unknown',
          uri: track.uri || null,
          duration: track.duration || null,
          sourceName: track.sourceName || null,
          artworkUrl: track.artworkUrl || null,
          addedAt: track.addedAt || Date.now()
        }));

      this.exec('UPDATE users SET history   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
        [JSON.stringify(history), userId]);

      logger.info('UserDB', `Cleaned up history for user ${userId}`);
    } catch (e) {
      logger.error('UserDB', `Failed to cleanup history for user ${userId}`, e);
    }
  }


  setUserHistory(userId, history) {
    this.ensureUser(userId);
    const limitedHistory   =history.slice(0, HISTORY_LIMIT);
    return this.exec(
      'UPDATE users SET history   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
      [JSON.stringify(limitedHistory), userId]
    );
  }

  linkSpotifyProfile(userId, profileUrl, displayName   =null) {
    this.ensureUser(userId);
    return this.exec(
      'UPDATE users SET spotify_profile_url   =?, spotify_display_name   =?, spotify_linked_at   =CURRENT_TIMESTAMP, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
      [profileUrl, displayName, userId]
    );
  }

  getSpotifyProfile(userId) {
    const user   =this.getUser(userId);
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
      'UPDATE users SET spotify_profile_url   =NULL, spotify_display_name   =NULL, spotify_linked_at   =NULL, updated_at   =CURRENT_TIMESTAMP WHERE id   =?',
      [userId]
    );
  }
}
