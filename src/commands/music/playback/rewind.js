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
import { Command } from "#structures/classes/Command";
import emoji from "#config/emoji";

class RewindCommand extends Command {
  constructor() {
    super({
      name: "rewind",
      description:
        "Rewind the current track by specified seconds (default: 10 seconds, not available for live streams)",
      usage: "rewind [seconds]",
      aliases: ["rw", "back10"],
      category: "music",
      examples: ["rewind", "rewind 30", "rw 15", "back10"],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: "rewind",
        description: "Rewind the current track by specified seconds",
        options: [
          {
            name: "seconds",
            description: "Number of seconds to rewind (default: 10)",
            type: 4,
            required: false,
            min_value: 1,
            max_value: 300,
          },
        ],
      },
    });
  }

  async execute({ message, args, pm }) {
    return this._handleRewind(message, pm, args);
  }

  async slashExecute({ interaction, pm }) {
    const seconds = interaction.options.getInteger("seconds");
    return this._handleRewind(
      interaction,
      pm,
      seconds ? [seconds.toString()] : [],
    );
  }

  async _handleRewind(context, pm, args = []) {
    const { currentTrack } = pm;

    if (currentTrack.info.isStream) {
      return this._reply(
        context,
        this._createErrorContainer("Cannot rewind a live stream."),
      );
    }

    let seconds = 10;
    if (args[0]) {
      const parsedSeconds = parseInt(args[0]);
      if (isNaN(parsedSeconds) || parsedSeconds < 1 || parsedSeconds > 300) {
        return this._reply(
          context,
          this._createErrorContainer(
            "Please provide a valid number of seconds between 1 and 300.",
          ),
        );
      }
      seconds = parsedSeconds;
    }

    const newPosition = await pm.rewind(seconds * 1000);

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("music")} **Track Rewound**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Position Information**\n\n` +
      `├─ **${emoji.get("check")} Rewound:** ${seconds} seconds backward\n` +
      `├─ **${emoji.get("info")} New Position:** ${this._formatDuration(newPosition / 1000)}\n` +
      `├─ **${emoji.get("folder")} Total Duration:** ${this._formatDuration(currentTrack.info.duration / 1000)}\n` +
      `└─ **${emoji.get("reset")} Status:** Successfully rewound\n\n` +
      `*Playback position has been moved backward*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            currentTrack.info.artworkUrl || config.assets.defaultTrackArtwork,
          ),
        ),
    );

    return this._reply(context, container);
  }

  _formatDuration(durationInSeconds) {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.floor(durationInSeconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
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
    }
    return context.channel.send(payload);
  }
}

export default new RewindCommand();
