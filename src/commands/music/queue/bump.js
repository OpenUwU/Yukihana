import { Command } from "#structures/classes/Command";
import { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import { config } from "#config/config";

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
      slashOptions: [
        {
          name: "position",
          description: "Position of track to bump (or start of range)",
          type: 4,
          required: true,
        },
        {
          name: "end_position",
          description: "End position for range (optional)",
          type: 4,
          required: false,
        },
      ],
    });
  }

  async execute({ client, message, args, pm }) {
    try {
      const player   =pm.player;

      if (!player || !player.queue.current) {
        return message.reply({
          components: [this._createErrorContainer("No music is currently playing.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      if (args.length   ===0) {
        return message.reply({
          components: [this._createErrorContainer("Please specify a track position or range to bump.")],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const result   =this._parsePosition(args);
      if (!result.success) {
        return message.reply({
          components: [this._createErrorContainer(result.message)],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const bumpResult   =await this._handleBump(player, result.startPos, result.endPos);

      return message.reply({
        components: [bumpResult.success ? this._createSuccessContainer(bumpResult) : this._createErrorContainer(bumpResult.message)],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      client.logger?.error("BumpCommand", `Error in prefix command: ${error.message}`, error);
      return message.reply({
        components: [this._createErrorContainer("An error occurred while bumping tracks.")],
        flags: MessageFlags.IsComponentsV2,
      }).catch(()   => {});
    }
  }

  async slashExecute({ client, interaction }) {
    try {
      const player   =client.music?.getPlayer(interaction.guild.id);

      if (!player || !player.queue.current) {
        return interaction.reply({
          components: [this._createErrorContainer("No music is currently playing.")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const position   =interaction.options.getInteger("position");
      const endPosition   =interaction.options.getInteger("end_position");

      const bumpResult   =await this._handleBump(player, position, endPosition);

      return interaction.reply({
        components: [bumpResult.success ? this._createSuccessContainer(bumpResult) : this._createErrorContainer(bumpResult.message)],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      client.logger?.error("BumpCommand", `Error in slash command: ${error.message}`, error);
      const errorContainer   =this._createErrorContainer("An error occurred while bumping tracks.");
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ components: [errorContainer] });
        } else {
          await interaction.reply({ components: [errorContainer], ephemeral: true });
        }
      } catch (e) {
      }
    }
  }

  _parsePosition(args) {
    const input   =args.join(" ");

    const rangeMatch   =input.match(/^(\d+)[-\s]+(\d+)$/);
    if (rangeMatch) {
      const start   =parseInt(rangeMatch[1]);
      const end   =parseInt(rangeMatch[2]);

      if (start < 1 || end < 1) {
        return { success: false, message: "Position numbers must be greater than 0." };
      }

      if (start > end) {
        return { success: false, message: "Start position must be less than or equal to end position." };
      }

      return { success: true, startPos: start, endPos: end };
    }

    const singleMatch   =input.match(/^(\d+)$/);
    if (singleMatch) {
      const pos   =parseInt(singleMatch[1]);

      if (pos < 1) {
        return { success: false, message: "Position must be greater than 0." };
      }

      return { success: true, startPos: pos, endPos: pos };
    }

    return { success: false, message: "Invalid position format. Use: `bump 5` or `bump 3-7`" };
  }

  async _handleBump(player, startPos, endPos) {
    const queue   =player.queue;
    const tracks   =queue.tracks;

    if (tracks.length   ===0) {
      return { success: false, message: "The queue is empty." };
    }

    const startIndex   =startPos - 1;
    const endIndex   =endPos - 1;

    if (startIndex >= tracks.length) {
      return { success: false, message: `Position ${startPos} is out of range. Queue has ${tracks.length} tracks.` };
    }

    if (endIndex >= tracks.length) {
      return { success: false, message: `Position ${endPos} is out of range. Queue has ${tracks.length} tracks.` };
    }

    if (startIndex   ===0 && endIndex < tracks.length - 1) {
      const isSingle   =startPos   ===endPos;
      return { 
        success: false, 
        message: isSingle 
          ? `Track at position ${startPos} is already at the top of the queue.`
          : `Tracks ${startPos}-${endPos} are already at the top of the queue.`
      };
    }

    const tracksToMove   =tracks.slice(startIndex, endIndex + 1);

    for (let i   =endIndex; i >= startIndex; i--) {
      tracks.splice(i, 1);
    }

    tracks.unshift(...tracksToMove);

    const isSingle   =startPos   ===endPos;
    const trackInfo   =isSingle ? tracksToMove[0] : null;

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

  _createErrorContainer(message) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("### Error"));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("**Unable to Bump**"),
          new TextDisplayBuilder().setContent(message)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
    );

    return container;
  }

  _createSuccessContainer(result) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("### Track Bumped"));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    let title, description;

    if (result.isSingle) {
      title   ="**Track Moved to Top**";
      const track   =result.trackInfo;
      description   =`**[${track.info.title}](${track.info.uri})**\n*Moved from position ${result.startPos} to position 1*`;
    } else {
      title   ="**Tracks Moved to Top**";
      description   =`*Moved ${result.trackCount} tracks from positions ${result.startPos}-${result.endPos} to the top of the queue*`;
    }

    const thumbnail   =result.isSingle && result.trackInfo?.info?.artworkUrl 
      ? result.trackInfo.info.artworkUrl 
      : config.assets.defaultTrackArtwork;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(title),
          new TextDisplayBuilder().setContent(description)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`*Queue now has ${result.queueLength} tracks*`)
    );

    return container;
  }
}
export default new BumpCommand()
