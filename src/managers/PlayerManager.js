import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { logger } from "#utils/logger";

import { QueueManager } from "./QueueManager.js";

export class PlayerManager {
  player;

  queue;

  guildId;

  constructor(player) {
    if (!player) {
      throw new Error("PlayerManager requires a valid player instance.");
    }
    this.player = player;
    this.guildId = player.guildId;
    this.queue = new QueueManager(player);
  }

  async connect() {
    await this.player.connect();
    return this;
  }

  async disconnect(force = false) {
    await this.player.disconnect(force);
    return this;
  }

  async destroy(reason, disconnect = true) {
    await this.player.destroy(reason, disconnect);
    return this;
  }

  async changeNode(newNode, checkSources = true) {
    return this.player.changeNode(newNode, checkSources);
  }

  async changeVoiceState(data) {
    await this.player.changeVoiceState(data);
    return this;
  }

  async play(options = {}) {
    await this.player.play(options);
    return this;
  }

  async playPrevious() {
    const previousTrack = await this.player.queue.shiftPrevious()
    if (!previousTrack) {
      logger?.warn(
        `[PlayerManager] No previous track to play for guild ${this.guildId}.`,
      );
      return false;
    }

    
    await this.player.play({ clientTrack: previousTrack });
    await this.player.queue.utils.save();
    return true;
  }

  async pause() {
    await this.player.pause();
    return this;
  }

  async resume() {
    await this.player.resume();
    return this;
  }

  async stop() {
    const { guildId } = this.player;
    const is247ModeEnabled = await this.is247ModeEnabled(guildId);

    if (!is247ModeEnabled) {
      this.player.destroy("Stop command", true);
      return;
    }
    const autoplayEnabled = this.player.get("autoplayEnabled") || false;

    if (autoplayEnabled) {
      this.player.set("autoplayEnabled", false);
     
    }
  // await  this.player.queue.tracks.splice(0, this.player.queue.tracks.length);
    await this.player.stopPlaying()
    return this;
  }

  async skip(amount) {
    const { player } = this;
    const { current } = player.queue;
    const duration = current?.info?.duration ?? 0;

    if (player.repeatMode === "track" && duration > 0) {
      await player.seek(duration);
    } else if (
      player.repeatMode === "queue" &&
      player.queue.length === 0 &&
      duration > 0
    ) {
      await player.seek(duration);
    } else if (this.queueSize > 0) {
      await player.skip(amount);
    } else {
      await this.stop();
    }

    return this;
  }

  async seek(position) {
    await this.player.seek(position);
    return this;
  }

  async is247ModeEnabled() {
    const settings = db.guild.get247Settings(this.guildId);
    
    if (settings.enabled === true) {
      
      return true
    
    } else {
      return 
    }
  }

  setData(key, value) {
    this.player.set(key, value);
    return this;
  }

  getData(key) {
    return this.player.get(key);
  }

  toJSON() {
    return this.player.toJSON();
  }

  async setVolume(volume) {
    await this.player.setVolume(volume);
    return this;
  }

  async setRepeatMode(mode) {
    await this.player.setRepeatMode(mode);
    return this;
  }

  get isConnected() {
    return this.player.connected;
  }
  get isPlaying() {
    return this.player.playing;
  }
  get isPaused() {
    return this.player.paused;
  }
  get repeatMode() {
    return this.player.repeatMode;
  }
  get currentTrack() {
    return this.player.queue.current;
  }
  get position() {
    return this.player.position;
  }
  get ping() {
    return this.player.ping;
  }
  get volume() {
    return this.player.volume;
  }
  get queueSize() {
    return this.player.queue.tracks.length;
  }
  get previousTracks() {
    return this.player.queue.previous;
  }
  get isEmpty(){
    if(this.queueSize === 0 && !this.currentTrack){
      return true;
    }else{
      return false;
    }
  }

  async addTracks(tracks, position) {
    if (position !== undefined && position !== null) {
      return await this.queue.add(tracks, position);
    }
    return await this.queue.add(tracks);
  }

  async removeTrack(position) {
    return await this.queue.remove(position);
  }

  async moveTrack(from, to) {
    return await this.queue.move(from, to);
  }

  async shuffleQueue() {
    return await this.queue.shuffle();
  }

  async clearQueue() {
   return await this.player.queue.tracks.splice(0, this.player.queue.tracks.length);
  }

  async forward(amount = 10000) {
    const currentPosition = this.position;
    const { currentTrack } = this;

    if (!currentTrack) return false;
    if (currentTrack.info.isStream) return false;

    const newPosition = Math.min(
      currentPosition + amount,
      currentTrack.info.duration,
    );
    await this.seek(newPosition);
    return newPosition;
  }

  async rewind(amount = 10000) {
    const currentPosition = this.position;
    const newPosition = Math.max(currentPosition - amount, 0);
    await this.seek(newPosition);
    return newPosition;
  }

  async replay() {
    await this.seek(0);
    return true;
  }

  async grab() {
    const track = this.currentTrack;
    if (!track) return null;
    return track;
  }

  async bumpToTop(startPos, endPos = startPos) {
    const { tracks } = this.player.queue;

    if (tracks.length === 0) {
      return { success: false, message: "The queue is empty." };
    }

    const startIndex = startPos - 1;
    const endIndex = endPos - 1;

    if (startIndex >= tracks.length || endIndex >= tracks.length) {
      return {
        success: false,
        message: `Position out of range. Queue has ${tracks.length} tracks.`,
      };
    }

    if (startIndex < 0 || endIndex < 0) {
      return { success: false, message: "Position must be greater than 0." };
    }

    if (startIndex === 0 && endIndex < tracks.length - 1) {
      const isSingle = startPos === endPos;
      return {
        success: false,
        message: isSingle
          ? `Track at position ${startPos} is already at the top of the queue.`
          : `Tracks ${startPos}-${endPos} are already at the top of the queue.`,
      };
    }

    const tracksToMove = tracks.slice(startIndex, endIndex + 1);

    for (let i = endIndex; i >= startIndex; i--) {
      tracks.splice(i, 1);
    }

    tracks.unshift(...tracksToMove);

    await this.player.queue.utils.save();

    const isSingle = startPos === endPos;
    const trackInfo = isSingle ? tracksToMove[0] : null;

    return {
      success: true,
      isSingle,
      trackCount: tracksToMove.length,
      startPos,
      endPos,
      trackInfo,
      queueLength: tracks.length,
    };
  }

  getPremiumStatus(guildId, userId) {
    try {
      const premiumStatus = db.hasAnyPremium(userId, guildId);

      return {
        hasPremium: Boolean(premiumStatus),
        type: premiumStatus ? premiumStatus.type : "free",
        maxSongs: premiumStatus
          ? config.queue?.maxSongs?.premium || 100
          : config.queue?.maxSongs?.free || 25,
      };
    } catch (error) {
      logger?.warn(
        `[PlayerManager] Failed to get premium status: ${error.message}`,
      );
      return {
        hasPremium: false,
        type: "free",
        maxSongs: 25,
      };
    }
  }

  get isSeekable() {
    const track = this.currentTrack;
    return track
      ? track.info.isSeekable !== false && !track.info.isStream
      : false;
  }

  get guildId() {
    return this.player.guildId;
  }

  get textChannelId() {
    return this.player.textChannelId || null;
  }

  get voiceChannelId() {
    return this.player.voiceChannelId || null;
  }

  get node() {
    return this.player.node || null;
  }

  get hasCurrentTrack() {
    return Boolean(this.player && this.player.queue.current);
  }

  formatDuration(ms) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
      .toString()
      .padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }

  getRequesterMention(requester) {
    if (
      typeof requester === "object" &&
      requester !== null &&
      "id" in requester
    ) {
      return `<@${requester.id}>`;
    }
    return "Unknown";
  }

  isYouTubeSource(track) {
    const uri = track.info.uri?.toLowerCase() || "";
    const sourceName = track.info.sourceName?.toLowerCase() || "";

    return (
      uri.includes("youtube.com") ||
      uri.includes("youtu.be") ||
      sourceName.includes("youtube") ||
      sourceName.includes("yt")
    );
  }

  createProgressBar(current, total, length = 15) {
    if (!total || total <= 0) return "░".repeat(length);
    const progress = Math.max(0, Math.min(1, current / total));
    const filledBlocks = Math.round(progress * length);
    const emptyBlocks = length - filledBlocks;
    return "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
  }

  getBestImage(images) {
    if (!images || !Array.isArray(images)) {
      return config.assets?.defaultTrackArtwork || "";
    }

    const sizeOrder = ["extralarge", "large", "medium", "small"];

    for (const size of sizeOrder) {
      const image = images.find((img) => img.size === size);
      if (image && image["#text"]) {
        return image["#text"];
      }
    }

    const fallback = images.find((img) => img["#text"]);
    return fallback
      ? fallback["#text"]
      : config.assets?.defaultTrackArtwork || "";
  }

  parseTimeToMs(timeString) {
    try {
      if (timeString.includes(":")) {
        const parts = timeString.split(":").map((p) => parseInt(p, 10));
        if (parts.some(isNaN)) return null;
        if (parts.length === 2) {
          return (parts[0] * 60 + parts[1]) * 1000;
        } else if (parts.length === 3) {
          return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        }
      }

      let totalMs = 0;
      const timeRegex =
        /(\d+)\s*(h|hr|hour|hours|m|min|minute|minutes|s|sec|second|seconds)/gi;
      let match;
      let hasMatch = false;

      while ((match = timeRegex.exec(timeString)) !== null) {
        hasMatch = true;
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        if (unit.startsWith("h")) {
          totalMs += value * 3600000;
        } else if (unit.startsWith("m")) {
          totalMs += value * 60000;
        } else if (unit.startsWith("s")) {
          totalMs += value * 1000;
        }
      }

      if (hasMatch) {
        return totalMs;
      }

      const seconds = parseInt(timeString, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }

      return null;
    } catch (error) {
      logger.error(
        `[PlayerManager] Error parsing time string: ${error.message}`,
      );
      return null;
    }
  }
}
