import { Database } from "#structures/classes/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";

export class Guild extends Database {
  constructor() {
    super(config.database.guild);
    this.initTable();
  }

  initTable() {
    this.exec(`
      CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        prefixes TEXT,
        default_volume INTEGER DEFAULT 100,
        blacklisted BOOLEAN DEFAULT FALSE,
        blacklist_reason TEXT DEFAULT NULL,
        auto_disconnect BOOLEAN DEFAULT TRUE,
        stay_247 BOOLEAN DEFAULT FALSE,
        stay_247_voice_channel TEXT DEFAULT NULL,
        stay_247_text_channel TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }


  getGuild(guildId) {

    if (!guildId) return null;
    return this.get("SELECT * FROM guilds WHERE id   =?", [guildId]);
  }

  ensureGuild(guildId) {

    if (!guildId) {
      const errorMessage   =`[GuildDB] A valid guildId must be provided to ensureGuild. Received: ${guildId}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    let guild   =this.getGuild(guildId);
    const defaultPrefix   =JSON.stringify([config.prefix]);

    if (!guild) {

      this.exec("INSERT INTO guilds (id, prefixes, default_volume, auto_disconnect, stay_247, stay_247_voice_channel, stay_247_text_channel) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        [guildId, defaultPrefix, 100, 1, 0, null, null]);
      return this.getGuild(guildId);
    }


    let needsUpdate   =false;
    const updates   ={};

    if (!guild.prefixes) {
      updates.prefixes   =defaultPrefix;
      needsUpdate   =true;
    }

    if (guild.default_volume   ===null || guild.default_volume   ===undefined) {
      updates.default_volume   =100;
      needsUpdate   =true;
    }

    if (guild.auto_disconnect   ===null || guild.auto_disconnect   ===undefined) {
      updates.auto_disconnect   =1;
      needsUpdate   =true;
    }

    if (guild.stay_247   ===null || guild.stay_247   ===undefined) {
      updates.stay_247   =0;
      needsUpdate   =true;
    }

    if (needsUpdate) {
      const keys   =Object.keys(updates);
      const setClause   =keys.map(key   => `${key}   =?`).join(", ");
      const values   =keys.map(key   => updates[key]);
      values.push(guildId);

      this.exec(`UPDATE guilds SET ${setClause}, updated_at   =CURRENT_TIMESTAMP WHERE id   =?`, values);
      guild   =this.getGuild(guildId);
    }

    return guild;
  }

  getPrefixes(guildId) {
    const guild   =this.ensureGuild(guildId);
    try {
      const prefixes   =JSON.parse(guild.prefixes);
      return Array.isArray(prefixes) && prefixes.length > 0 ? prefixes : [config.prefix];
    } catch (e) {
      return [config.prefix];
    }
  }

  setPrefixes(guildId, prefixes) {
    this.ensureGuild(guildId);
    const prefixesJson   =JSON.stringify(prefixes);
    return this.exec(
      "UPDATE guilds SET prefixes   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [prefixesJson, guildId]
    );
  }

  getDefaultVolume(guildId) {
    const guild   =this.ensureGuild(guildId);
    return guild.default_volume || 100;
  }

  setDefaultVolume(guildId, volume) {
    this.ensureGuild(guildId);

    if (volume < 1 || volume > 100) {
      throw new Error("Volume must be between 1 and 100");
    }

    return this.exec(
      "UPDATE guilds SET default_volume   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [volume, guildId]
    );
  }

  getAllGuilds() {
    return this.all("SELECT * FROM guilds");
  }

  updateSettings(guildId, settings) {
    this.ensureGuild(guildId);
    const allowedKeys   =["prefixes", "default_volume", "auto_disconnect", "stay_247", "stay_247_voice_channel", "stay_247_text_channel"];
    const keys   =Object.keys(settings).filter(key   => allowedKeys.includes(key));

    if (keys.length   ===0) return null;

    const setClause   =keys.map((key)   => `${key}   =?`).join(", ");
    const values   =keys.map((key)   => settings[key]);
    values.push(guildId);

    return this.exec(
      `UPDATE guilds SET ${setClause}, updated_at   =CURRENT_TIMESTAMP WHERE id   =?`,
      values
    );
  }

  blacklistGuild(guildId, reason   ="No reason provided") {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET blacklisted   =1, blacklist_reason   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [reason, guildId]
    );
  }

  unblacklistGuild(guildId) {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET blacklisted   =0, blacklist_reason   =NULL, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [guildId]
    );
  }

  isBlacklisted(guildId) {
    const guild   =this.getGuild(guildId);
    if (!guild || !guild.blacklisted) return false;

    return {
      blacklisted: true,
      reason: guild.blacklist_reason || "No reason provided",
    };
  }

  getAllBlacklistedGuilds() {
    return this.all("SELECT * FROM guilds WHERE blacklisted   =1");
  }

  get247Settings(guildId) {
    const guild   =this.ensureGuild(guildId);
    return {
      enabled: guild.stay_247   ===1 || guild.stay_247   ===true,
      voiceChannel: guild.stay_247_voice_channel,
      textChannel: guild.stay_247_text_channel,
      autoDisconnect: guild.auto_disconnect   !==0 && guild.auto_disconnect   !==false
    };
  }

  set247Mode(guildId, enabled, voiceChannelId   =null, textChannelId   =null) {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET stay_247   =?, stay_247_voice_channel   =?, stay_247_text_channel   =?, auto_disconnect   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [
        enabled ? 1 : 0, 
        enabled ? voiceChannelId : null, 
        enabled ? textChannelId : null, 
        enabled ? 0 : 1, 
        guildId
      ]
    );
  }

  getAll247Guilds() {
    return this.all("SELECT * FROM guilds WHERE stay_247   =1 AND stay_247_voice_channel IS NOT NULL");
  }

  setAutoDisconnect(guildId, enabled) {
    this.ensureGuild(guildId);
    return this.exec(
      "UPDATE guilds SET auto_disconnect   =?, updated_at   =CURRENT_TIMESTAMP WHERE id   =?",
      [enabled ? 1 : 0, guildId]
    );
  }

  getValid247Guilds() {
    const guilds   =this.all(`
      SELECT * FROM guilds 
      WHERE stay_247   =1 
      AND stay_247_voice_channel IS NOT NULL 
      AND stay_247_voice_channel   !=''
    `);

    return guilds.filter(guild   => {
      return guild.stay_247_voice_channel && guild.stay_247_voice_channel.length > 0;
    });
  }
}
