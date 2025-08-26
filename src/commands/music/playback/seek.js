import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

import { config } from "#config/config";
import emoji from "#config/emoji";

class SeekCommand extends Command {
  constructor() {
    super({
      name: "seek",
      description:
        "Seek to a specific time in the current track using various time formats",
      usage: "seek <time>",
      aliases: ["sk"],
      category: "music",
      examples: ["seek 2:30", "seek 1min 30s", "sk 90s", "seek 0:45"],
      cooldown: 5,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: "seek",
        description: "Seek to a specific time in the current track",
        options: [
          {
            name: "time",
            description: "Time to seek to (e.g., 2:30, 1min 30s, 90s)",
            type: 3,
            required: true,
          },
        ],
      },
    });
  }

  async execute({ message, args, pm }) {
    if (!args[0]) {
      return this._reply(
        message,
        this._createErrorContainer(
          "Please provide a time to seek to. (e.g., `2:30`, `1min 30s`, `90s`)",
        ),
      );
    }

    const timeString = args.join(" ");
    return this._handleSeek(message, pm, timeString);
  }

  async slashExecute({ interaction, pm }) {
    const timeString = interaction.options.getString("time");
    return this._handleSeek(interaction, pm, timeString);
  }

  async _handleSeek(context, pm, timeString) {
    const track = pm.currentTrack;

    if (!track.info.isSeekable) {
      return this._reply(
        context,
        this._createErrorContainer("This track is not seekable."),
      );
    }

    const timeMs = this._parseTime(timeString);
    if (timeMs === null) {
      return this._reply(
        context,
        this._createErrorContainer(
          "Invalid time format. Use formats like `2:30`, `1min 30s`, or `90s`.",
        ),
      );
    }

    if (timeMs > track.info.duration) {
      return this._reply(
        context,
        this._createErrorContainer(
          "The specified time exceeds the track duration.",
        ),
      );
    }

    await pm.seek(timeMs);

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("music")} **Track Seeked**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Position Information**\n\n` +
      `├─ **${emoji.get("check")} New Position:** ${this._formatDuration(timeMs / 1000)}\n` +
      `├─ **${emoji.get("info")} Total Duration:** ${this._formatDuration(track.info.duration / 1000)}\n` +
      `├─ **${emoji.get("folder")} Track:** ${track.info.title}\n` +
      `└─ **${emoji.get("reset")} Status:** Successfully seeked\n\n` +
      `*Playback position has been updated*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            track.info.artworkUrl || config.assets.defaultTrackArtwork,
          ),
        ),
    );

    return this._reply(context, container);
  }

  _parseTime(timeString) {
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
      return null;
    }
  }

  _formatDuration(durationInSeconds) {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.floor(durationInSeconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  _createErrorContainer(message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Something went wrong**\n\n` +
      `├─ **${emoji.get("info")} Issue:** ${message}\n` +
      `└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n` +
      `*Please check your input and try again*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.defaultThumbnail ||
              config.assets?.defaultTrackArtwork,
          ),
        ),
    );

    return container;
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    if (context.reply) {
      return context.reply(payload);
    } else {
      return context.channel.send(payload);
    }
  }
}

export default new SeekCommand();
