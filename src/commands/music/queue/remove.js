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

class RemoveCommand extends Command {
  constructor() {
    super({
      name: 'remove',
      description: 'Remove a track from the queue',
      usage: 'remove <position>',
      aliases: ['rm', 'del'],
      category: 'music',
      examples: [
        'remove 3',
        'rm 1',
        'del 5',
      ],
      cooldown: 3,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      enabledSlash: true,
      slashData: {
        name: 'remove',
        description: 'Remove a track from the queue',
        options: [
          {
            name: 'position',
            description: 'Position of the track to remove (1-based)',
            type: 4,
            required: true,
            min_value: 1,
          },
        ],
      },
    });
  }

  async execute({ client, message, args, pm }) {
    try {
      const { player } = pm;

      if (!player || !player.queue.current) {
        return this._sendError(message, 'No music is currently playing');
      }

      if (args.length === 0) {
        return this._sendUsageError(message);
      }

      const position = parseInt(args[0]);

      if (isNaN(position)) {
        return this._sendError(message, 'Position must be a valid number');
      }

      const queue = player.queue.tracks;

      if (queue.length === 0) {
        return this._sendError(message, 'There are no tracks in the queue to remove');
      }

      if (position < 1 || position > queue.length) {
        return this._sendError(message, `Position must be between 1 and ${queue.length}`);
      }

      const track = queue[position - 1];
      queue.splice(position - 1, 1);

      const container = this._createSuccessContainer(track, position, queue.length);
      const sent = await this._reply(message, container);

      if (sent) {
        this._setupCollector(sent, message.author);
      }
    } catch (error) {
      logger.error('RemoveCommand', 'Remove command error:', error);
      return this._sendError(message, 'An error occurred while removing the track');
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const player = client.music?.getPlayer(interaction.guild.id);

      if (!player || !player.queue.current) {
        return this._sendError(interaction, 'No music is currently playing');
      }

      const position = interaction.options.getInteger('position');
      const queue = player.queue.tracks;

      if (queue.length === 0) {
        return this._sendError(interaction, 'There are no tracks in the queue to remove');
      }

      if (position < 1 || position > queue.length) {
        return this._sendError(interaction, `Position must be between 1 and ${queue.length}`);
      }

      const track = queue[position - 1];
      queue.splice(position - 1, 1);

      const container = this._createSuccessContainer(track, position, queue.length);
      const sent = await this._reply(interaction, container);

      if (sent) {
        this._setupCollector(sent, interaction.user);
      }
    } catch (error) {
      logger.error('RemoveCommand', 'Remove slash command error:', error);
      return this._sendError(interaction, 'An error occurred while removing the track');
    }
  }

  _createSuccessContainer(track, position, remainingCount) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('check')} **Track Removed**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Successfully removed track from queue**\n\n` +
      `**${emoji.get('music')} Removed Track**\n` +
      `├─ **[${track.info.title}](${track.info.uri || '#'})**\n` +
      `├─ Artist: ${track.info.author || 'Unknown'}\n` +
      `├─ Was at position: ${position}\n` +
      `└─ Duration: ${this._formatDuration(track.info.length)}\n\n` +
      `**${emoji.get('folder')} Queue Status**\n` +
      `├─ Tracks remaining: ${remainingCount}\n` +
      `├─ Queue updated successfully\n` +
      `└─ Playback continues normally`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('remove_help')
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
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Remove Usage**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**How to use the remove command**\n\n` +
      `**${emoji.get('check')} Command Format**\n` +
      `├─ \`${this.usage}\`\n` +
      `├─ Position numbers start from 1\n` +
      `├─ Must specify a valid queue position\n` +
      `└─ Track will be permanently removed\n\n` +
      `**${emoji.get('folder')} Usage Examples**\n` +
      `├─ \`remove 3\` → Remove track at position 3\n` +
      `├─ \`rm 1\` → Remove first track in queue\n` +
      `├─ \`del 5\` → Remove track at position 5\n` +
      `└─ Position must exist in current queue\n\n` +
      `**${emoji.get('add')} Requirements**\n` +
      `├─ Must be in the same voice channel\n` +
      `├─ Queue must contain tracks\n` +
      `├─ Position must be valid (1 to queue length)\n` +
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
        .setCustomId('remove_back')
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
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **Remove Help**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = `**Remove tracks from your music queue**\n\n` +
      `**${emoji.get('check')} What it does:**\n` +
      `├─ Permanently removes a track from the queue\n` +
      `├─ Other tracks move up to fill the gap\n` +
      `├─ Queue positions automatically adjust\n` +
      `└─ Currently playing song is unaffected\n\n` +
      `**${emoji.get('folder')} Command Examples:**\n` +
      `├─ \`remove 1\` → Remove first queued track\n` +
      `├─ \`rm 3\` → Remove track at position 3\n` +
      `├─ \`del 10\` → Remove track at position 10\n` +
      `└─ Use \`queue\` command to see positions\n\n` +
      `**${emoji.get('add')} Tips:**\n` +
      `├─ Check queue first to find track positions\n` +
      `├─ Positions change after each removal\n` +
      `├─ Cannot remove currently playing track\n` +
      `└─ Use \`clear\` to remove all tracks`;

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
        .setCustomId('remove_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
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

        if (interaction.customId === "remove_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "remove_back") {
          await interaction.editReply({
            components: [this._createUsageContainer()],
          });
        }
      } catch (error) {
        logger.error("RemoveCommand", "Collector Error:", error);
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
      logger.debug("RemoveCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("RemoveCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("RemoveCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
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
      logger.error("RemoveCommand", "Failed to reply in Remove command:", e);
      return null;
    }
  }
}

export default new RemoveCommand();