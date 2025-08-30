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
import { db } from "#database/DatabaseManager";
import { Command } from "#structures/classes/Command";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

class AutoplayCommand extends Command {
  constructor() {
    super({
      name: "autoplay",
      description:
        "Toggle autoplay feature that adds similar songs when queue ends",
      usage: "autoplay [on|off]",
      aliases: ["ap", "auto"],
      category: "music",
      examples: ["autoplay", "autoplay on", "autoplay off", "ap"],
      cooldown: 5,
      voiceRequired: false,
      sameVoiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: "autoplay",
        description:
          "Toggle autoplay feature that adds similar songs when queue ends",
        options: [
          {
            name: "state",
            description: "Turn autoplay on or off",
            type: 3,
            required: false,
            choices: [
              { name: "On", value: "on" },
              { name: "Off", value: "off" },
            ],
          },
        ],
      },
    });
  }

  async execute({ client, message, args }) {
    const state = args[0]?.toLowerCase();
    return this._handleAutoplay(client, message.guild.id, message, state);
  }

  async slashExecute({ client, interaction }) {
    const state = interaction.options.getString("state");
    return this._handleAutoplay(
      client,
      interaction.guild.id,
      interaction,
      state,
    );
  }

  async _handleAutoplay(client, guildId, context, state) {
    const player = client.music?.getPlayer(guildId);
    const currentStatus = player?.get("autoplayEnabled") || false;
    const userId = context.user?.id || context.author?.id;

    let newStatus;
    if (state === "on" || state === "enable" || state === "true") {
      newStatus = true;
    } else if (state === "off" || state === "disable" || state === "false") {
      newStatus = false;
    } else {
      newStatus = !currentStatus;
    }

    if (player) {
      player.set("autoplayEnabled", newStatus);
      player.set("autoplaySetBy", userId);
    }

    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const container = this._createAutoplayContainer(
      newStatus,
      premiumStatus,
      state !== undefined,
    );
    await this._reply(context, container);

    logger.info(
      "AutoplayCommand",
      `Autoplay ${newStatus ? "enabled" : "disabled"} in guild ${guildId}`,
    );
  }

  _createAutoplayContainer(isEnabled, premiumStatus, wasDirectCommand = false) {
    const container = new ContainerBuilder();
    const statusText = isEnabled ? "Enabled" : "Disabled";

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("music")} **Autoplay ${statusText}**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    let content = wasDirectCommand
      ? `**Autoplay mode has been updated**\n\n`
      : `**Configure intelligent music continuation**\n\n`;

    if (isEnabled) {
      content +=
        `**${emoji.get("check")} Autoplay Active**\n` +
        `├─ Automatically finds similar songs when queue ends\n` +
        `├─ Seamless music continuation without interruption\n` +
        `├─ Smart recommendations based on listening history\n` +
        `└─ Perfect for continuous background music\n\n`;
    } else {
      content +=
        `**${emoji.get("cross")} Autoplay Disabled**\n` +
        `├─ Music stops when queue is finished\n` +
        `├─ No automatic song recommendations\n` +
        `├─ Manual queue management required\n` +
        `└─ Traditional playlist behavior\n\n`;
    }

    content += `**${emoji.get("folder")} Your Plan Benefits**\n`;

    if (premiumStatus.hasPremium) {
      content +=
        `├─ Premium Status: Active\n` + `└─Autoplay songs: Up to 10 tracks\n\n`;
    } else {
      content +=
        `├─ Free Plan: Active\n` +
        `├─ Autoplay songs: Up to 6 tracks\n` +
        `└─ Upgrade for enhanced features\n\n`;
    }

    content +=
      `**${emoji.get("info")} How It Works**\n` +
      `├─ Analyzes your last played track\n` +
      `└─ Adds them automatically to continue playback\n`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
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

  async _fetchMessage(messageOrInteraction) {
    if (messageOrInteraction.fetchReply) {
      return await messageOrInteraction.fetchReply();
    } else if (messageOrInteraction.fetch) {
      return await messageOrInteraction.fetch();
    } else {
      return messageOrInteraction;
    }
  }

  _getPremiumStatus(guildId, userId) {
    const premiumStatus = db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: Boolean(premiumStatus),
      type: premiumStatus ? premiumStatus.type : "free",
      maxSongs: premiumStatus
        ? config.queue.maxSongs.premium
        : config.queue.maxSongs.free,
    };
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
      logger.error(
        "AutoplayCommand",
        "Failed to reply in Autoplay command:",
        e,
      );
      return null;
    }
  }
}

export default new AutoplayCommand();
