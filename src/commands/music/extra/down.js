import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  FileBuilder,
  MessageFlags,
  ButtonStyle,
} from "discord.js";
import fetch from "node-fetch";
import { logger } from "#utils/logger";

class DownloadCommand extends Command {
  constructor() {
    super({
      name: "download",
      description: "Download the currently playing Spotify song using Components v2.",
      usage: "download",
      aliases: ["dl"],
      category: "music",
      examples: ["download", "dl"],
      cooldown: 15,
      playerRequired: true,
      playingRequired: true,
      enabledSlash: true,
      slashData: {
        name: "download",
        description: "Download the currently playing Spotify song.",
      },
    });

    this.apiKey   ="gifted";
    this.baseUrl   ="https://api.giftedtech.web.id/api/download/spotifydl";
  }

  async execute({ message, pm }) {
    return this._handleDownload(message, pm);
  }

  async slashExecute({ interaction, pm }) {
    return this._handleDownload(interaction, pm);
  }

  async _handleDownload(context, pm) {
    const song   =await pm.grab();

    if (!song || !song.info.uri.includes('spotify.com')) {
      const errorContent   =!song ? '❌ No song is currently playing.' : '❌ Current track is not from Spotify.';
      const errorContainer   =new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(errorContent));
      return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    }

    const loadingContainer   =new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`⏳ Downloading **${song.info.title}**...`));

    const loadingMsg   =await context.reply({
      components: [loadingContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    try {
      const apiUrl   =`${this.baseUrl}?apikey  =${this.apiKey}&url  =${encodeURIComponent(song.info.uri)}`;
      const response   =await fetch(apiUrl);
      const data   =await response.json();

      if (!data.success || data.status   !==200 || !data.result.download_url) {
        throw new Error(data.message || "Failed to retrieve download link from API.");
      }

      const audioResponse   =await fetch(data.result.download_url);
      if (!audioResponse.ok) throw new Error(`Failed to download audio file (status: ${audioResponse.status})`);
      const audioBuffer   =await audioResponse.buffer();

      const fileName   =`${song.info.title.replace(/[^a-zA-Z0-9]/g, '_') || 'song'}.mp3`;

      const successContainer   =new ContainerBuilder()
          .setAccentColor(0x57F287);

      successContainer.addSectionComponents(
          new SectionBuilder()
              .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(`### ✅ Download Complete`),
                  new TextDisplayBuilder().setContent(`**${song.info.title}** by ${song.info.author}`)
              )
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.info.artworkUrl))
      );

      successContainer.addFileComponents(
          new FileBuilder()
            .setURL(`attachment://${fileName}`)
      );

      successContainer.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('View on Spotify')
                .setURL(song.info.uri)
        )
      );

      await loadingMsg.edit({
          components: [successContainer],
          files: [{ attachment: audioBuffer, name: fileName }],
          flags: MessageFlags.IsComponentsV2
      });

    } catch (error) {
      logger.error("DownloadCommand", "Download command error:", error);
      const errorContainer   =new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ❌ Download Failed`),
            new TextDisplayBuilder().setContent(`\`\`\`\ncontact bre4d777\n\`\`\``)
        );

      await loadingMsg.edit({ components: [errorContainer], files: [], flags: MessageFlags.IsComponentsV2 }).catch(()   => {});
    }
  }
}

export default new DownloadCommand();
