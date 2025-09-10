import { Guild } from "#db/Guild";
import { User } from "#db/User";
import { Playlists } from "#db/Playlists"
import { Premium } from "#db/Premium";
import { logger } from "#utils/logger";

export class DatabaseManager {
  constructor() {
    this.initDatabases();
  }

  initDatabases() {
    try {
      this.guild = new Guild();
      this.user = new User();
      this.premium = new Premium();
      this.playlists = new Playlists();
      logger.success(
        "DatabaseManager",
        "All databases initialized successfully",
      );
    } catch (error) {
      logger.error("DatabaseManager", "Failed to initialize databases", error);
      throw error;
    }
  }

  closeAll() {
    try {
      this.guild.close();
      this.user.close();
      this.premium.close();
      this.playlists.close();
      logger.info("DatabaseManager", "All database connections closed");
    } catch (error) {
      logger.error(
        "DatabaseManager",
        "Failed to close database connections",
        error,
      );
    }
  }

  getPrefixes(guildId) {
    return this.guild.getPrefixes(guildId);
  }

  setPrefixes(guildId, prefixes) {
    return this.guild.setPrefixes(guildId, prefixes);
  }

  isGuildBlacklisted(guildId) {
    return this.guild.isBlacklisted(guildId);
  }

  blacklistGuild(guildId, reason = "No reason provided") {
    return this.guild.blacklistGuild(guildId, reason);
  }

  unblacklistGuild(guildId) {
    return this.guild.unblacklistGuild(guildId);
  }

  hasNoPrefix(userId) {
    return this.user.hasNoPrefix(userId);
  }

  setNoPrefix(userId, enabled, expiryTimestamp = null) {
    return this.user.setNoPrefix(userId, enabled, expiryTimestamp);
  }

  getUserPrefixes(userId) {
    return this.user.getUserPrefixes(userId);
  }

  setUserPrefixes(userId, prefixes) {
    return this.user.setUserPrefixes(userId, prefixes);
  }

  isUserBlacklisted(userId) {
    return this.user.isBlacklisted(userId);
  }

  blacklistUser(userId, reason = "No reason provided") {
    return this.user.blacklistUser(userId, reason);
  }

  unblacklistUser(userId) {
    return this.user.unblacklistUser(userId);
  }

  getUserData(userId) {
    return this.user.ensureUser(userId);
  }

  isUserPremium(userId) {
    return this.premium.isUserPremium(userId);
  }

  isGuildPremium(guildId) {
    return this.premium.isGuildPremium(guildId);
  }

  hasAnyPremium(userId, guildId) {
    return this.premium.hasAnyPremium(userId, guildId);
  }

  grantUserPremium(
    userId,
    grantedBy,
    expiresAt = null,
    reason = "Premium granted",
  ) {
    return this.premium.grantUserPremium(userId, grantedBy, expiresAt, reason);
  }

  grantGuildPremium(
    guildId,
    grantedBy,
    expiresAt = null,
    reason = "Premium granted",
  ) {
    return this.premium.grantGuildPremium(
      guildId,
      grantedBy,
      expiresAt,
      reason,
    );
  }

  revokeUserPremium(userId) {
    return this.premium.revokeUserPremium(userId);
  }

  revokeGuildPremium(guildId) {
    return this.premium.revokeGuildPremium(guildId);
  }
}

export const db = new DatabaseManager();
