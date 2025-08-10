import { logger } from "#utils/logger";
import { readdirSync, statSync, mkdirSync } from "fs";
import { join, extname, resolve } from "path";

export class LLEventsManager {
  constructor(client, musicManager) {
    this.client   =client;
    this.musicManager   =musicManager;
    this.lavalink   =musicManager.lavalink;
    this.events   ={
      client: new Map(),
      player: new Map(),
      track: new Map(),
      node: new Map()
    };
    this.eventCounts   ={
      client: 0,
      player: 0,
      track: 0,
      node: 0
    };
  }

  async initialize() {
    try {
      await this.loadAllEvents();
      this.setupEventListeners();
      logger.success("LLEventsManager", "Initialized successfully with all event handlers");
    } catch (error) {
      logger.error("LLEventsManager", "Failed to initialize event system", error);
      throw error;
    }
  }

  async loadAllEvents() {
    try {
      const eventsPath   =resolve(process.cwd(), "src", "lavalink");
      logger.info("LLEventsManager", `Base events path: ${eventsPath}`);

      if (!this.directoryExists(eventsPath)) {
        logger.warn("LLEventsManager", "Events directory not found, creating structure...");
        this.createEventStructure(eventsPath);
        return;
      }

      await this.loadEventCategory("client", join(eventsPath, "client"));
      await this.loadEventCategory("player", join(eventsPath, "player"));
      await this.loadEventCategory("track", join(eventsPath, "track"));
      await this.loadEventCategory("node", join(eventsPath, "node"));

      logger.success("LLEventsManager",
        `Loaded ${this.getTotalEventCount()} events: ` +
        `Client(${this.eventCounts.client}) | ` +
        `Player(${this.eventCounts.player}) | ` +
        `Track(${this.eventCounts.track}) | ` +
        `Node(${this.eventCounts.node})`
      );

    } catch (error) {
      logger.error("LLEventsManager", "Failed to load events", error);
    }
  }

  async loadEventCategory(category, categoryPath) {
    logger.debug("LLEventsManager", `Loading ${category} events from: ${categoryPath}`);

    if (!this.directoryExists(categoryPath)) {
      logger.warn("LLEventsManager", `${category} events directory not found: ${categoryPath}`);
      return;
    }

    try {
      const files   =readdirSync(categoryPath).filter(file   =>
        file.endsWith('.js') && !file.startsWith('.')
      );

      logger.debug("LLEventsManager", `Found ${files.length} ${category} event files: ${files.join(', ')}`);

      for (const file of files) {
        await this.loadEventFile(category, categoryPath, file);
      }

    } catch (error) {
      logger.error("LLEventsManager", `Failed to load ${category} events`, error);
    }
  }

  async loadEventFile(category, categoryPath, filename) {
    try {
      const filePath   =join(categoryPath, filename);
      const eventName   =filename.replace(extname(filename), '');

      logger.debug("LLEventsManager", `Loading ${category} event: ${filename} -> ${eventName}`);

      const eventModule   =await import(`file://${resolve(filePath)}?t=${Date.now()}`);
      const EventClass   =eventModule.default || eventModule[eventName] || eventModule;

      if (typeof EventClass   !=='function' && typeof EventClass.execute   !=='function') {
        logger.warn("LLEventsManager", `Invalid event file: ${filename} - No executable function found. Type: ${typeof EventClass}`);
        return;
      }

      const eventHandler   =typeof EventClass   ==='function' && EventClass.prototype
        ? new EventClass(this.musicManager, this.client)
        : EventClass;

      this.events[category].set(eventName, eventHandler);
      this.eventCounts[category]++;

      logger.debug("LLEventsManager", `✅ Loaded ${category} event: ${eventName}`);

    } catch (error) {
      logger.error("LLEventsManager", `Failed to load event file: ${filename}`, error);
    }
  }

  setupEventListeners() {
    this.registerClientEvents();
    this.registerPlayerEvents();
    this.registerTrackEvents();
    this.registerNodeEvents();
  }

  registerClientEvents() {
    for (const [eventName, eventHandler] of this.events.client) {
      try {
        if (typeof eventHandler.execute   ==='function') {
          this.client.on(eventName, (...args)   => {
            this.executeEvent('client', eventName, eventHandler, args);
          });
        } else if (typeof eventHandler   ==='function') {
          this.client.on(eventName, (...args)   => {
            this.executeEvent('client', eventName, { execute: eventHandler }, args);
          });
        }
        logger.debug("LLEventsManager", `Registered client event: ${eventName}`);
      } catch (error) {
        logger.error("LLEventsManager", `Failed to register client event: ${eventName}`, error);
      }
    }
  }

  registerPlayerEvents() {
    const playerEvents   =[
      'playerCreate', 'playerDestroy', 'playerDisconnect', 'playerMove',
      'playerSocketClosed', 'playerUpdate', 'playerMuteChange', 'playerDeafChange',
      'playerSuppressChange', 'playerQueueEmptyStart', 'playerQueueEmptyEnd',
      'playerQueueEmptyCancel', 'playerVoiceJoin', 'playerVoiceLeave'
    ];

    for (const eventName of playerEvents) {
      const eventHandler   =this.events.player.get(eventName);
      if (eventHandler) {
        try {
          this.lavalink.on(eventName, (...args)   => {
            this.executeEvent('player', eventName, eventHandler, args);
          });
          logger.debug("LLEventsManager", `Registered player event: ${eventName}`);
        } catch (error) {
          logger.error("LLEventsManager", `Failed to register player event: ${eventName}`, error);
        }
      }
    }
  }

  registerTrackEvents() {
    const trackEvents   =[
      'trackStart', 'trackStuck', 'trackError', 'trackEnd', 'queueEnd',
      'SegmentsLoaded', 'SegmentSkipped', 'ChapterStarted', 'ChaptersLoaded',
      'LyricsLine', 'LyricsFound', 'LyricsNotFound',
      'debug'
    ];

    for (const eventName of trackEvents) {
      const eventHandler   =this.events.track.get(eventName);
      if (eventHandler) {
        try {
          this.lavalink.on(eventName, (...args)   => {
            this.executeEvent('track', eventName, eventHandler, args);
          });
          logger.debug("LLEventsManager", `Registered track event: ${eventName}`);
        } catch (error) {
          logger.error("LLEventsManager", `Failed to register track event: ${eventName}`, error);
        }
      }
    }
  }

  registerNodeEvents() {
    const nodeEvents   =[
      'raw', 'disconnect', 'connect', 'reconnecting', 'reconnectinprogress',
      'create', 'destroy', 'error', 'resumed'
    ];

    for (const eventName of nodeEvents) {
      const eventHandler   =this.events.node.get(eventName);
      if (eventHandler) {
        try {
          this.lavalink.nodeManager.on(eventName, (...args)   => {
            this.executeEvent('node', eventName, eventHandler, args);
          });
          logger.debug("LLEventsManager", `Registered node event: ${eventName}`);
        } catch (error) {
          logger.error("LLEventsManager", `Failed to register node event: ${eventName}`, error);
        }
      }
    }
  }

  async executeEvent(category, eventName, eventHandler, args) {
    try {
      if (typeof eventHandler.execute   ==='function') {
        await eventHandler.execute(...args);
      } else if (typeof eventHandler   ==='function') {
        await eventHandler(...args);
      }
    } catch (error) {
      logger.error("LLEventsManager",
        `Error executing ${category} event '${eventName}': ${error.message}`,
        error
      );
    }
  }

  directoryExists(path) {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  createEventStructure(basePath) {
    try {
      mkdirSync(basePath, { recursive: true });

      const dirs   =['client', 'player', 'track', 'node'];
      for (const dir of dirs) {
        mkdirSync(join(basePath, dir), { recursive: true });
      }

      logger.success("LLEventsManager", "Created event directory structure");
    } catch (error) {
      logger.error("LLEventsManager", "Failed to create event structure", error);
    }
  }

  getTotalEventCount() {
    return Object.values(this.eventCounts).reduce((total, count)   => total + count, 0);
  }

  reloadEvent(category, eventName) {
    try {
      const eventHandler   =this.events[category].get(eventName);
      if (eventHandler) {
        logger.info("LLEventsManager", `Reloaded ${category} event: ${eventName}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error("LLEventsManager", `Failed to reload event: ${eventName}`, error);
      return false;
    }
  }

  getEventInfo() {
    return {
      totalEvents: this.getTotalEventCount(),
      categories: this.eventCounts,
      events: {
        client: Array.from(this.events.client.keys()),
        player: Array.from(this.events.player.keys()),
        track: Array.from(this.events.track.keys()),
        node: Array.from(this.events.node.keys())
      }
    };
  }
}
