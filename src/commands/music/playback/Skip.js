import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  StringSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";

import { config } from "#config/config";
import { logger } from "#utils/logger";

class SkipCommand extends Command {
  constructor() {
    super({
      name: "skip",
      description: "Skip the current track or jump to a specific track in the queue",
      usage: "skip [amount]",
      aliases: ["s", "next"],
      category: "music",
      examples: [
        "skip",
        "skip 3",
        "s 5",
        "next"
      ],
      cooldown: 2,
      voiceRequired: true,
      sameVoiceRequired: true,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: "skip",
        description: "Skip the current track or multiple tracks",
        options: [{
          name: "amount",
          description: "Number of tracks to skip (default: 1).",
          type: 4,
          required: false,
          min_value: 1
        }],
      },
    });
  }

  async execute({ client, message, args, pm }) {
    const amount   =args[0] ? parseInt(args[0], 10) : 1;
    if (isNaN(amount) || amount < 1) {
      return this._reply(message, this._createErrorContainer("Please provide a valid number of tracks to skip."));
    }
    return this._handleSkip(client, message, pm, amount);
  }

  async slashExecute({ client, interaction, pm }) {
    const amount   =interaction.options.getInteger("amount") || 1;
    return this._handleSkip(client, interaction, pm, amount);
  }

  async _handleSkip(client, context, pm, amount) {
    const queueSize   =pm.queueSize;
    const skippedTrack   =pm.currentTrack;

    if (amount > queueSize + 1) {
      return this._reply(context, this._createErrorContainer(`Cannot skip ${amount} tracks. Only ${queueSize} tracks are in the queue.`));
    }

    if (amount > queueSize) {
      await pm.skip();
      const stopContainer   =new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Playback Stopped`))
        .addSectionComponents(new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Skipped the last track and emptied the queue.`))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(skippedTrack.info.artworkUrl || config.assets.defaultTrackArtwork))
        );
      return this._reply(context, stopContainer);
    }

    const newCurrentTrack   =pm.queue.tracks[amount - 1];
    await pm.skip(amount);

    const container   =this._createSuccessContainer(skippedTrack, newCurrentTrack, amount);
    const hasQueue   =pm.queueSize > 0;

    if (hasQueue) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addActionRowComponents(this._createSkipToMenu(pm));
    }

    const message   =await this._reply(context, container);
    if (message && hasQueue) {
      this._setupCollector(message, client, pm.guildId);
    }
  }

  _createSuccessContainer(skipped, current, amount) {
    const container   =new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(amount   ===1 ? `### Track Skipped` : `### Skipped ${amount} Tracks`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`*Skipped:* **[${skipped.info.title}](${skipped.info.uri})**`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(skipped.info.artworkUrl || config.assets.defaultTrackArtwork))
    );

    if (current) {
      container.addSectionComponents(
        new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`*Now Playing:* **[${current.info.title}](${current.info.uri})**`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(current.info.artworkUrl || config.assets.defaultTrackArtwork))
      );
    }
    return container;
  }

  _createSkipToMenu(pm) {
    const options   =pm.queue.tracks.slice(0, 25).map((track, index)   => ({
      label: track.info.title.substring(0, 100),
      description: `by ${track.info.author || 'Unknown'}`.substring(0, 100),
      value: `${index}`,
    }));

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
      .setCustomId(`skip_to_track_${pm.guildId}`)
      .setPlaceholder("Or skip directly to another track...")
      .addOptions(options)
    );
  }

  async _setupCollector(message, client, guildId) {
    const filter   =(i)   => i.customId   ===`skip_to_track_${guildId}`;
    const collector   =message.createMessageComponentCollector({ filter, time: 60_000, max: 1 });

    collector.on("collect", async (interaction)   => {
      await interaction.deferUpdate();
      const player   =client.music?.getPlayer(guildId);

      if (!player || !player.playing) {
        return interaction.editReply({ content: 'The player is no longer active.', components: [] });
      }

      const pm   =new PlayerManager(player);
      const trackIndex   =parseInt(interaction.values[0], 10);

      if (trackIndex >= pm.queueSize) {
        return interaction.editReply({ content: 'This track is no longer in the queue.', components: [] });
      }

      const targetTrack   =pm.queue.tracks[trackIndex];
      await pm.skip(trackIndex + 1);

      const container   =new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Skipped to Track`))
        .addSectionComponents(new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`*Now Playing:* **[${targetTrack.info.title}](${targetTrack.info.uri})**`))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(targetTrack.info.artworkUrl || config.assets.defaultTrackArtwork))
        );
      await interaction.editReply({ components: [container], content: '' });
    });

    collector.on("end", async (collected)   => {
      if (collected.size > 0) return;

      try {
        const currentMessage   =await message.fetch().catch(()   => null);
        if (!currentMessage || currentMessage.components.length   ===0) return;

        const firstRow   =ActionRowBuilder.from(currentMessage.components[0]);
        if (!firstRow) return;

        firstRow.components.forEach(component   => component.setDisabled(true));
        await currentMessage.edit({ components: [firstRow] });
      } catch (e) {
        if (e.code   !==10008) logger.error("SkipCommand", "Failed to disable skip menu:", e);
      }
    });
  }

  _createErrorContainer(message) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Error**\n*${message}*`)
    );
  }

  async _reply(context, container) {
    const payload   ={
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

export default new SkipCommand();
