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

    const lastTrackInfo = wasPlaying
      ? {
          title: wasPlaying.info.title,
          uri: wasPlaying.info.uri,
          artworkUrl:
            wasPlaying.info.artworkUrl || config.assets.defaultTrackArtwork,
        }
      : null;

    await pm.stop();

    const container = new ContainerBuilder();
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Playback Stopped"),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const section = new SectionBuilder();
    if (!pm.is247ModeEnabled) {
      let description = "I have left the voice channel.";
      if (queueLength > 0) {
        description = `The queue was cleared of ${queueLength} track${queueLength === 1 ? "" : "s"}.`;
        section.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(description),
        );
      }
    } else {
      let description =
        "I Cant leave the voice channel as 247 is enabled first use /247 disable then use stop command.";
      section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(description),
      );
    }

    if (lastTrackInfo) {
      section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Last Track:** [${lastTrackInfo.title}](${lastTrackInfo.uri})`,
        ),
      );
      section.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(
          lastTrackInfo.artworkUrl || config.assets.defaultTrackArtwork,
        ),
      );
    } else {
      section.setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
      );
    }

    container.addSectionComponents(section);

    return this._reply(context, container);
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
