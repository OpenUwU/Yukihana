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

class ResumeCommand extends Command {
  constructor() {
    super({
      name: "resume",
      description: "Resume the paused track and continue playback",
      usage: "resume",
      aliases: ["unpause"],
      category: "music",
      examples: ["resume", "unpause"],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: "resume",
        description: "Resume the paused track",
      },
    });
  }

  async execute({ message, pm }) {
    return this._handleResume(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleResume(interaction, pm);
  }

  async _handleResume(context, pm) {
    if (!pm.isPaused) {
      return this._reply(
        context,
        this._createErrorContainer("The player is not paused."),
      );
    }

    await pm.resume();

    const container = new ContainerBuilder();
    const { currentTrack } = pm;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("music")} **Player Resumed**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Track Information**\n\n` +
      `├─ **${emoji.get("music")} Title:** ${currentTrack.info.title}\n` +
      `├─ **${emoji.get("folder")} Artist:** ${currentTrack.info.author || "Unknown"}\n` +
      `├─ **${emoji.get("info")} Duration:** ${this._formatDuration(currentTrack.info.duration)}\n` +
      `└─ **${emoji.get("check")} Status:** Playback resumed\n\n` +
      `*Track is now playing in voice channel*`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            currentTrack?.info?.artworkUrl || config.assets.defaultTrackArtwork,
          ),
        ),
    );

    return this._reply(context, container);
  }

  _formatDuration(ms) {
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
export default new ResumeCommand();
