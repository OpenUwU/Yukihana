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

class StopCommand extends Command {
  constructor() {
    super({
      name: "stop",
      description:
        "Stop music playback, clear the queue, and disconnect from the voice channel",
      usage: "stop",
      aliases: ["disconnect", "leave"],
      category: "music",
      examples: ["stop", "disconnect", "leave"],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: "stop",
        description: "Stop music playback and clear the queue",
      },
    });
  }

  async execute({ message, pm }) {
    return this._handleStop(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleStop(interaction, pm);
  }

  async _handleStop(context, pm) {
    const wasPlaying = pm.currentTrack;
    const queueLength = pm.queueSize;
    const is247Enabled = await pm.is247ModeEnabled()
    

    const lastTrackInfo = wasPlaying
      ? {
          title: wasPlaying.info.title,
          author: wasPlaying.info.author || "Unknown",
          duration: this._formatDuration(wasPlaying.info.duration),
          artworkUrl:
            wasPlaying.info.artworkUrl || config.assets.defaultTrackArtwork,
        }
      : null;

    await pm.stop();

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("music")} **${is247Enabled ? "Queue Cleared" : "Playback Stopped"}**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    let content;
    if (is247Enabled === true) {
      content =
        `**247 Mode Active**\n\n` +
        `├─ **${emoji.get("info")} Status:** Queue cleared, staying connected\n` +
        `├─ **${emoji.get("folder")} Queue:** ${queueLength > 0 ? `Removed ${queueLength} track${queueLength === 1 ? "" : "s"}` : "Was already empty"}\n` +
        `├─ **${emoji.get("check")} Connection:** Maintained in voice channel\n` +
        `└─ **${emoji.get("reset")} Action:** Use /247 disable to allow disconnection\n\n` +
        `*Bot will remain connected due to 247 mode*`;
    } else {
      content =
        `**Playback Information**\n\n` +
        `├─ **${emoji.get("check")} Status:** Successfully stopped\n` +
        `├─ **${emoji.get("folder")} Queue:** ${queueLength > 0 ? `Cleared ${queueLength} track${queueLength === 1 ? "" : "s"}` : "Was empty"}\n` +
        `├─ **${emoji.get("reset")} Connection:** Disconnected from voice\n` +
        `└─ **${emoji.get("info")} Action:** Playback completely stopped\n\n` +
        `*Bot has left the voice channel*`;
    }

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            lastTrackInfo
              ? lastTrackInfo.artworkUrl
              : config.assets?.defaultThumbnail ||
                  config.assets?.defaultTrackArtwork,
          ),
        ),
    );

    if (lastTrackInfo) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const lastTrackContent =
        `**Last Track**\n\n` +
        `├─ **${emoji.get("music")} Title:** ${lastTrackInfo.title}\n` +
        `├─ **${emoji.get("folder")} Artist:** ${lastTrackInfo.author}\n` +
        `├─ **${emoji.get("info")} Duration:** ${lastTrackInfo.duration}\n` +
        `└─ **${emoji.get("check")} Status:** ${is247Enabled ? "Cleared from queue" : "Stopped playing"}\n\n` +
        `*Track information from last playback*`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(lastTrackContent),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(lastTrackInfo.artworkUrl),
          ),
      );
    }

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

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };

    if (context.replied || context.deferred) {
      return context.followUp(payload);
    }
    return context.reply(payload);
  }
}

export default new StopCommand();
