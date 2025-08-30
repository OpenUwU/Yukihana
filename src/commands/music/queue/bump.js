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
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#structures/classes/Command';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';

class BumpCommand extends Command {
  constructor() {
    super({
      name: "bump",
      description: "Move track(s) to the top of the queue",
      usage: "bump <position> [end_position]",
      aliases: ["top", "priority"],
      category: "music",
      examples: ["bump 5", "bump 3-7", "bump 2 5"],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: "bump",
        description: "Move track(s) to the top of the queue",
        options: [
          {
            name: "position",
            description: "Position of track to bump (or start of range)",
            type: 4,
            required: true,
            min_value: 1,
          },
          {
            name: "end_position",
            description: "End position for range (optional)",
            type: 4,
            required: false,
            min_value: 1,
          },
        ],
      },
    });
  }

  async execute({ client, message, args, pm }) {
    try {
      const player = pm.player;

      if (!player || !player.queue.current) {
        return this._sendError(message, "No music is currently playing.");
      }

      if (args.length === 0) {
        return this._sendUsageError(message);
      }

      const result = this._parsePosition(args);
      if (!result.success) {
        return this._sendError(message, result.message);
      }

      const bumpResult = await this._handleBump(player, result.startPos, result.endPos);

      if (!bumpResult.success) {
        return this._sendError(message, bumpResult.message);
      }

      const container = this._createSuccessContainer(bumpResult);
      const sent = await this._reply(message, container);

      if (sent) {
        this._setupCollector(sent, message.author);
      }
    } catch (error) {
      logger.error("BumpCommand", `Error in prefix command: ${error.message}`, error);
      return this._sendError(message, "An error occurred while bumping tracks.");
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const player = client.music?.getPlayer(interaction.guild.id);

      if (!player || !player.queue.current) {
        return this._sendError(interaction, "No music is currently playing.");
      }

      const position = interaction.options.getInteger("position");
      const endPosition = interaction.options.getInteger("end_position");

      const bumpResult = await this._handleBump(player, position, endPosition);

      if (!bumpResult.success) {
        return this._sendError(interaction, bumpResult.message);
      }

      const container = this._createSuccessContainer(bumpResult);
      const sent = await this._reply(interaction, container);

      if (sent) {
        this._setupCollector(sent, interaction.user);
      }
    } catch (error) {
      logger.error("BumpCommand", `Error in slash command: ${error.message}`, error);
      return this._sendError(interaction, "An error occurred while bumping tracks.");
    }
  }

  _parsePosition(args) {
    const input = args.join(" ");

    const rangeMatch = input.match(/^(\d+)[-\s]+(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);

      if (start < 1 || end < 1) {
        return { success: false, message: "Position numbers must be greater than 0." };
      }

      if (start > end) {
        return { success: false, message: "Start position must be less than or equal to end position." };
      }

      return { success: true, startPos: start, endPos: end };
    }

    const singleMatch = input.match(/^(\d+)$/);
    if (singleMatch) {
      const pos = parseInt(singleMatch[1]);

      if (pos < 1) {
        return { success: false, message: "Position must be greater than 0." };
      }

      return { success: true, startPos: pos, endPos: pos };
    }

    return { success: false, message: "Invalid position format. Use: `bump 5` or `bump 3-7`" };
  }

  async _handleBump(player, startPos, endPos) {
    const queue = player.queue;
    const tracks = queue.tracks;

    if (tracks.length === 0) {
      return { success: false, message: "The queue is empty." };
    }

    const startIndex = startPos - 1;
    const endIndex = endPos - 1;

    if (startIndex >= tracks.length) {
      return { success: false, message: `Position ${startPos} is out of range. Queue has ${tracks.length} tracks.` };
    }

    if (endIndex >= tracks.length) {
      return { success: false, message: `Position ${endPos} is out of range. Queue has ${tracks.length} tracks.` };
    }

    if (startIndex === 0 && endIndex < tracks.length - 1) {
      const isSingle = startPos === endPos;
      return { 
        success: false, 
        message: isSingle 
          ? `Track at position ${startPos} is already at the top of the queue.`
          : `Tracks ${startPos}-${endPos} are already at the top of the queue.`
      };
    }

    const tracksToMove = tracks.slice(startIndex, endIndex + 1);

    for (let i = endIndex; i >= startIndex; i--) {
      tracks.splice(i, 1);
    }

    tracks.unshift(...tracksToMove);

    const isSingle = startPos === endPos;
    const trackInfo = isSingle ? tracksToMove[0] : null;

    return {
      success: true,
      isSingle,
      trackCount: tracksToMove.length,
      startPos,
      endPos,
      trackInfo,
      queueLength: tracks.length
    };
  }

  _createSuccessContainer(result) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('check')} **Track Bumped**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let content;
    let thumbnail;

    if (result.isSingle) {
      const track = result.trackInfo;
      content = `**Successfully moved track to top priority**\n\n` +
        `**${emoji.get('music')} Bumped Track**\n` +
        `├─ **[${track.info.title}](${track.info.uri || '#'})**\n` +
        `├─ Artist: ${track.info.author || 'Unknown'}\n` +
        `├─ From position: ${result.startPos}\n` +
        `├─ New position: 1 (Top Priority)\n` +
        `└─ Duration: ${this._formatDuration(track.info.length)}\n\n` +
        `**${emoji.get('folder')} Queue Status**\n` +
        `├─ Total tracks: ${result.queueLength}\n` +
        `├─ Track moved to front of queue\n` +
        `├─ Will play next after current song\n` +
        `└─ Other tracks shifted down accordingly`;

      thumbnail = track.info.artworkUrl || config.assets.defaultTrackArtwork;
    } else {
      content = `**Successfully moved multiple tracks to top priority**\n\n` +
        `**${emoji.get('music')} Bumped Tracks**\n` +
        `├─ Track range: ${result.startPos}-${result.endPos}\n` +
        `├─ Total moved: ${result.trackCount} tracks\n` +
        `├─ New positions: 1-${result.trackCount}\n` +
        `└─ All moved to front of queue\n\n` +
        `**${emoji.get('folder')} Queue Status**\n` +
        `├─ Total tracks: ${result.queueLength}\n` +
        `├─ Multiple tracks prioritized\n` +
        `├─ Will play in order after current song\n` +
        `└─ Remaining tracks shifted down accordingly`;

      thumbnail = config.assets.defaultTrackArtwork;
    }

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bump_help')
        .setLabel('Help & Info')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('info'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createUsageContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Bump Usage**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**How to use the bump command**\n\n` +
      `**${emoji.get('check')} Command Format**\n` +
      `├─ \`${this.usage}\`\n` +
      `├─ Position numbers start from 1\n` +
      `├─ Can move single tracks or ranges\n` +
      `└─ Tracks move to top of queue\n\n` +
      `**${emoji.get('folder')} Usage Examples**\n` +
      `├─ \`bump 5\` → Move track 5 to position 1\n` +
      `├─ \`bump 3 7\` → Move tracks 3-7 to top\n` +
      `├─ \`top 2\` → Move track 2 to front\n` +
      `└─ \`priority 4\` → Prioritize track 4\n\n` +
      `**${emoji.get('add')} Requirements**\n` +
      `├─ Must be in the same voice channel\n` +
      `├─ Queue must contain tracks\n` +
      `├─ Position(s) must be valid\n` +
      `└─ Music player must be active`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bump_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Bump Help**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Prioritize tracks by moving them to queue front**\n\n` +
      `**${emoji.get('check')} What it does:**\n` +
      `├─ Moves specified track(s) to top of queue\n` +
      `├─ Tracks will play next after current song\n` +
      `├─ Other tracks automatically shift down\n` +
      `└─ Perfect for prioritizing favorite songs\n\n` +
      `**${emoji.get('folder')} Command Examples:**\n` +
      `├─ \`bump 5\` → Move track 5 to position 1\n` +
      `├─ \`bump 3 6\` → Move tracks 3, 4, 5, 6 to top\n` +
      `├─ \`top 2\` → Quick bump track 2 to front\n` +
      `└─ Use \`queue\` to see current positions\n\n` +
      `**${emoji.get('add')} Benefits:**\n` +
      `├─ Instant track prioritization\n` +
      `├─ No need to remove and re-add tracks\n` +
      `├─ Maintains queue order for other tracks\n` +
      `└─ Great for managing long playlists`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bump_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createErrorContainer(message) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('cross')} **Error**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _setupCollector(message, author) {
    const filter = (i) => i.user.id === author.id;
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300_000,
    });

    collector.on("collect", async (interaction) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === "bump_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "bump_back") {
          await interaction.editReply({
            components: [this._createUsageContainer()],
          });
        }
      } catch (error) {
        logger.error("BumpCommand", "Collector Error:", error);
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "limit" || reason === "messageDelete") return;

      try {
        const currentMessage = await this._fetchMessage(message).catch(() => null);

        if (!currentMessage?.components?.length) {
          return;
        }

        const containerWithoutButtons = new ContainerBuilder();

        currentMessage.components.forEach(component => {
          if (component.type !== ComponentType.ActionRow) {
            if (component.type === ComponentType.TextDisplay) {
              containerWithoutButtons.addTextDisplayComponents(component);
            } else if (component.type === ComponentType.Separator) {
              containerWithoutButtons.addSeparatorComponents(component);
            } else if (component.type === ComponentType.Section) {
              containerWithoutButtons.addSectionComponents(component);
            }
          }
        });

        await currentMessage.edit({
          components: [containerWithoutButtons],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (error) {
        this._handleDisableError(error, reason);
      }
    });
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

  _handleDisableError(error, reason) {
    if (error.code === 10008) {
      logger.debug("BumpCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("BumpCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("BumpCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
    }
  }

  _sendUsageError(context) {
    const container = this._createUsageContainer();
    const sent = this._reply(context, container);

    if (sent) {
      this._setupCollector(sent, context.author || context.user);
    }
    return sent;
  }

  _sendError(context, message) {
    const container = this._createErrorContainer(message);
    return this._reply(context, container);
  }

  _formatDuration(ms) {
    if (!ms || ms === 0) return '0:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    };
    try {
      if (context.replied || context.deferred) {
        return context.followUp(payload);
      }
      return context.reply(payload);
    } catch(e) {
      logger.error("BumpCommand", "Failed to reply in Bump command:", e);
      return null;
    }
  }
}

export default new BumpCommand();