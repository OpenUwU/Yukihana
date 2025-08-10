export class QueueManager {
  player;

  constructor(player) {
    this.player   =player;
  }

  get tracks() {
    return this.player.queue.tracks;
  }

  get previous() {
    return this.player.queue.previous;
  }

  get current() {
    return this.player.queue.current;
  }

  get totalDuration() {
    return this.player.queue.utils.totalDuration();
  }

  async add(trackOrTracks, index) {
    return this.player.queue.add(trackOrTracks, index);
  }

  async addToTop(trackOrTracks) {
    const tracks   =Array.isArray(trackOrTracks)
      ? trackOrTracks
      : [trackOrTracks];
    return this.player.queue.splice(0, 0, ...tracks);
  }

  async remove(start, end   =start) {
    if (end < start) [start, end]   =[end, start];
    return this.player.queue.splice(start, end - start + 1);
  }

  async move(from, to) {
    const [track]   =this.tracks.splice(from, 1);
    if (track) {
      this.tracks.splice(to, 0, track);
      await this.player.queue.utils.save();
    }
  }

  async shuffle() {
    return this.player.queue.shuffle();
  }

  async clear() {
    const clearedCount   =this.tracks.length;
    await this.player.queue.splice(0, clearedCount);
    return clearedCount;
  }

  async splice(index, amount, tracks) {
    return this.player.queue.splice(index, amount, tracks);
  }

  toJSON() {
    return this.player.queue.utils.toJSON();
  }
}
