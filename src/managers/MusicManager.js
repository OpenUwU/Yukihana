import { LavalinkManager } from "lavalink-client";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.initialized = false;
    this.eventsManager = null;
    this.init();
  }

  init() {
    try {
      this.lavalink = new LavalinkManager({
        nodes: config.nodes,
        sendToShard: (guildId, payload) => {
          if (this.client.cluster) {
            return this.client.cluster.broadcastEval(
              (client, context) => {
                const guild = client.guilds.cache.get(context.guildId);
                if (guild) {
                  guild.shard.send(context.payload);
                  return true;
                }
                return false;
              },
              { context: { guildId, payload } },
            );
          } else {
            return this.client.guilds.cache.get(guildId)?.shard?.send(payload);
          }
        },
        autoSkip: true,
        client: {
          id: config.clientId || this.client.user?.id,
          username: this.client.user?.username || "MusicBot",
        },
        autoSkipOnResolveError: true,
        emitNewSongsOnly: false,
        playerOptions: {
          maxErrorsPerTime: {
            threshold: 10_000,
            maxAmount: 3,
          },
          minAutoPlayMs: 10_000,
          applyVolumeAsFilter: false,
          clientBasedPositionUpdateInterval: 50,
          defaultSearchPlatform: "spsearch",
          onDisconnect: {
            autoReconnect: true,
            destroyPlayer: false,
          },
          useUnresolvedData: true,
        },
        queueOptions: {
          maxPreviousTracks: 10,
        },
        linksAllowed: true,
        linksBlacklist: [],
        linksWhitelist: [],
      });

      this.client.on("ready", async () => {
        logger.success(
          "MusicManager",
          `🎵 ${this.client.user.tag} music system is ready!`,
        );

        this.lavalink.init(this.client.user);
        this.initialized = true;
        logger.success("MusicManager", "Initialized successfully");
      });
    } catch (error) {
      logger.error("MusicManager", "Failed to initialize music system", error);
      logger.error(
        "MusicManager",
        "❌ FATAL ERROR INITIALIZING MUSIC SYSTEM:",
        error,
      );
      this.initialized = false;
    }
  }

  formatMS_HHMMSS(ms) {
    if (!ms || ms === 0) return "0:00";

    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  async createPlayer(options) {
    if (!this.initialized) {
      logger.error("MusicManager", "Cannot create player – not initialized");
      return null;
    }

    try {
      logger.debug(
        "MusicManager",
        `🔧 DEBUG: createPlayer called with options: ${JSON.stringify(options)}`,
      );

      const { guildId, textId, voiceId } = this.parsePlayerOptions(options);

      logger.debug(
        "MusicManager",
        `🔧 DEBUG: Parsed options: ${JSON.stringify({ guildId, textId, voiceId })}`,
      );

      if (!guildId || !textId || !voiceId) {
        logger.error("MusicManager", "Missing IDs for player creation", {
          guildId,
          textId,
          voiceId,
        });
        logger.debug("MusicManager", "❌ DEBUG: Missing required IDs");
        return null;
      }

      const existing = this.lavalink.getPlayer(guildId);
      if (existing) {
        logger.debug(
          "MusicManager",
          `Player already exists for guild ${guildId}`,
        );
        logger.debug(
          "MusicManager",
          "🔧 DEBUG: Player already exists, returning existing",
        );
        return existing;
      }

      let playerVolume = 100;
      try {
        if (db) {
          playerVolume = db.guild.getDefaultVolume(guildId);
          logger.debug(
            "MusicManager",
            `🔧 DEBUG: Got default volume from database: ${playerVolume}`,
          );
          logger.debug(
            "MusicManager",
            `Using default volume ${playerVolume} for guild ${guildId}`,
          );
        } else {
          logger.debug(
            "MusicManager",
            "⚠️ DEBUG: Database or getDefaultVolume method not available, using fallback",
          );
          logger.warn(
            "MusicManager",
            "Database not available, using fallback volume 100",
          );
        }
      } catch (error) {
        logger.debug(
          "MusicManager",
          `❌ DEBUG: Error getting default volume: ${error.message}`,
        );
        logger.warn(
          "MusicManager",
          `Failed to get default volume for guild ${guildId}, using 100: ${error.message}`,
        );
        playerVolume = 100;
      }

      if (isNaN(playerVolume) || playerVolume < 1 || playerVolume > 100) {
        logger.debug(
          "MusicManager",
          `⚠️ DEBUG: Invalid volume, resetting to 100: ${playerVolume}`,
        );
        logger.warn(
          "MusicManager",
          `Invalid volume ${playerVolume}, using 100`,
        );
        playerVolume = 100;
      }

      logger.debug(
        "MusicManager",
        `🔧 DEBUG: Final volume to use: ${playerVolume}`,
      );
      logger.info(
        "MusicManager",
        `Creating player for guild ${guildId} with default volume ${playerVolume}`,
      );

      const playerConfig = {
        guildId: guildId,
        voiceChannelId: voiceId,
        textChannelId: textId,
        selfDeaf: true,
        selfMute: false,
        volume: playerVolume,
        instaUpdateFiltersFix: true,
        applyVolumeAsFilter: false,
      };

      logger.debug(
        "MusicManager",
        `🔧 DEBUG: Player config: ${JSON.stringify(playerConfig)}`,
      );

      const player = await this.lavalink.createPlayer(playerConfig);

      if (!player) {
        logger.debug(
          "MusicManager",
          "❌ DEBUG: Lavalink createPlayer returned null/undefined",
        );
        logger.error(
          "MusicManager",
          `Failed to create player for guild ${guildId}`,
        );
        return null;
      }

      logger.debug(
        "MusicManager",
        "🔧 DEBUG: Player created successfully, attempting connection",
      );

      if (!player.connected) {
        logger.debug(
          "MusicManager",
          "🔧 DEBUG: Player not connected, connecting...",
        );
        await player.connect();
        logger.debug("MusicManager", "🔧 DEBUG: Player connected");
      }

      logger.success(
        "MusicManager",
        `Player created and connected successfully for guild ${guildId} with default volume ${playerVolume}`,
      );
      logger.debug(
        "MusicManager",
        "✅ DEBUG: Player creation completed successfully",
      );
      return player;
    } catch (error) {
      logger.debug(
        "MusicManager",
        `❌ DEBUG: Error in createPlayer: ${error.message}`,
      );
      logger.error(
        "MusicManager",
        `Error creating player for guild ${options?.guildId || "unknown"}: ${error.message}`,
      );
      logger.error("MusicManager", `Full error stack: ${error.stack}`);
      return null;
    }
  }

  async search(query, options = {}) {
    if (!this.initialized) {
      logger.error("MusicManager", "Cannot search – not initialized");
      return null;
    }

    try {
      const { source = "spsearch", requester } = options;

      const node = this.lavalink.nodeManager.leastUsedNodes("memory")[0];

      const searchResult = await node.search({ query, source }, requester);

      if (!searchResult || !searchResult.tracks?.length) {
        logger.debug("MusicManager", `No tracks found for query: ${query}`);
        return null;
      }

      return searchResult;
    } catch (error) {
      logger.error("MusicManager", `Search error: ${error.message}`);
      return null;
    }
  }

  getPlayer(guildId) {
    if (!this.initialized) {
      logger.warn(
        "MusicManager",
        "Attempted to get player before initialization.",
      );
      return undefined;
    }
    return this.lavalink.getPlayer(guildId);
  }

  getDefaultVolume(guildId) {
    try {
      return db.guild.getDefaultVolume(guildId);
    } catch (error) {
      logger.warn(
        "MusicManager",
        `Failed to get default volume for guild ${guildId}: ${error.message}`,
      );
      return 100;
    }
  }

  setDefaultVolume(guildId, volume) {
    try {
      db.guild.setDefaultVolume(guildId, volume);
      logger.success(
        "MusicManager",
        `Default volume set to ${volume} for guild ${guildId}`,
      );
      return true;
    } catch (error) {
      logger.error(
        "MusicManager",
        `Failed to set default volume for guild ${guildId}: ${error.message}`,
      );
      return false;
    }
  }
  async is247ModeEnabled(guildId) {
    const settings = db.guild.get247Settings(guildId);
    if (settings.enabled === true) {
      return 
    } else {
      
    }
  }
  parsePlayerOptions(options) {
    if (options.guildId && options.textChannelId && options.voiceChannelId) {
      return {
        guildId: options.guildId,
        textId: options.textChannelId,
        voiceId: options.voiceChannelId,
      };
    }

    if (options.guildId && options.textChannel && options.voiceChannel) {
      return {
        guildId: options.guildId,
        textId: options.textChannel.id,
        voiceId: options.voiceChannel.id,
      };
    }

    logger.error(
      "MusicManager",
      "Invalid options for player creation",
      options,
    );
    return {};
  }
}
