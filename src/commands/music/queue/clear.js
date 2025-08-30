import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";

import { config } from "#config/config";
import { Command } from "#structures/classes/Command";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

class ClearCommand extends Command {
  constructor() {
    super({
      name: "clear",
      description: "clear the q",
      usage: "shuffle",
      aliases: ["cq"],
      category: "music",
      examples: ["clear"],
      cooldown: 5,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: "clear",
        description: "clear the queue",
      },
    });
  }

  async execute({ message, pm }) {
    return this._handleclear(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleclear(interaction, pm);
  }

  async _handleclear(context, pm) {
    if (pm.queueSize === 0) {
      return this._reply(
        context,
        this._createErrorContainer("The queue is empty."),
      );
    }
    const size = pm.queueSize;
    await pm.clearQueue();

    const container = this._createSuccessContainer(pm, size);
    const message = await this._reply(context, container);
  }

  _createSuccessContainer(pm, size) {
    const container = new ContainerBuilder();
    const current = pm.currentTrack;

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("music")} **Queue cleared**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Success**\n\n` +
      `**${emoji.get("check")} clear Complete**\n` +
      `├─ cleared ${size} tracks in the queue\n` +
      `├─ currently playing ${current.info.title}\n` +
      `├─ Currently playing track remains unchanged\n` +
      `└─ Playback ends after current song ends\n\n`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(
          current?.info?.artworkUrl || config.assets.defaultTrackArtwork,
        ),
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    return container;
  }

  _createErrorContainer(message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(
          config.assets.defaultThumbnail || config.assets.defaultTrackArtwork,
        ),
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    return container;
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    try {
      if (context.replied || context.deferred) {
        return context.followUp(payload);
      }
      return context.reply(payload);
    } catch (e) {
      logger.error("clear", "Failed to reply in clwar command:", e);
      return null;
    }
  }
}

export default new ClearCommand();
