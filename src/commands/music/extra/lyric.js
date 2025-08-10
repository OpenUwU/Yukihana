import { Command } from "#structures/classes/Command";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from "discord.js";
import axios from "axios";
import { logger } from "#utils/logger";

const activeSyncSessions   =new Map();

class LyricsCommand extends Command {
  constructor() {
    super({
      name: "lyrics",
      description: "Get lyrics for the currently playing Spotify song",
      usage: "lyrics",
      aliases: ["lyric", "l"],
      category: "music",
      examples: ["lyrics", "l"],
      cooldown: 10,
      voiceRequired: true,
      sameVoiceRequired: true,
      enabledSlash: true,
      slashData: {
        name: "lyrics",
        description: "Get lyrics for the currently playing Spotify song",
      },
    });
  }

  async execute({ client, message }) {
    return this._handleLyrics(client, message.guild.id, message);
  }

  async slashExecute({ client, interaction }) {
    return this._handleLyrics(client, interaction.guild.id, interaction);
  }

  async _handleLyrics(client, guildId, context) {
    const player   =client.music?.getPlayer(guildId);

    if (!player || !player.queue.current) {
      return this._reply(
        context,
        this._createErrorContainer("No song is currently playing."),
      );
    }

    const currentTrack   =player.queue.current;

    if (this._getSource(currentTrack)   !=="spotify") {
      return this._reply(
        context,
        this._createErrorContainer(
          "Lyrics are only available for tracks played from Spotify.",
        ),
      );
    }

    const loadingMessage   =await this._reply(
      context,
      this._createLoadingContainer(currentTrack),
    );

    try {
      const lyricsData   =await this._fetchLyrics(currentTrack);

      if (!lyricsData) {
        const errorContainer   =this._createErrorContainer(
          `No lyrics found for "${currentTrack.info.title}".`,
        );
        return this._updateMessage(loadingMessage, errorContainer, context);
      }

      const pages   =this._splitLyrics(lyricsData.lyrics);
      const container   =this._buildLyricsContainer(
        currentTrack,
        lyricsData,
        pages[0],
        0,
        pages.length,
      );

      const message   =await this._updateMessage(
        loadingMessage,
        container,
        context,
      );
      if (message) {
        this._setupCollector(
          message,
          client,
          context,
          currentTrack,
          lyricsData,
          pages,
        );
      }
    } catch (error) {
      client.logger?.error(
        "LyricsCommand",
        `Failed to fetch or process lyrics: ${error.message}`,
        error,
      );
      const errorContainer   =this._createErrorContainer(
        "An error occurred while fetching lyrics.",
      );
      await this._updateMessage(loadingMessage, errorContainer, context);
    }
  }

  _getSource(track) {
    return track.info.sourceName?.toLowerCase() || "unknown";
  }

  async _fetchLyrics(track) {
    const artist   =track.info.author;
    const title   =track.info.title;
    const duration   =Math.round(track.info.duration / 1000);

    const params   =new URLSearchParams({
      artist_name: artist,
      track_name: title,
      album_name: track.info.album || "",
      duration: duration,
    });
    const url   =`https://lrclib.net/api/get?${params.toString()}`;

    try {
      const { data }   =await axios.get(url, { timeout: 8000 });
      if (!data || !data.plainLyrics) return null;

      return {
        title: data.trackName,
        artist: data.artistName,
        lyrics: data.plainLyrics,
        syncedLyrics: data.syncedLyrics,
        hasSync: !!data.syncedLyrics,
      };
    } catch (e) {
      if (e.response?.status   ===404) {
        return null;
      }
      logger.error("LyricsCommand", "Failed to fetch lyrics from lrclib:", e.message);
      throw e;
    }
  }

  _setupCollector(message, client, context, track, lyricsData, pages) {
    const userId   =context.user?.id || context.author?.id;
    const collector   =message.createMessageComponentCollector({
      filter: (i)   => i.user.id   ===userId,
      time: 600_000,
    });

    let currentPage   =0;
    let isSyncing   =false;

    collector.on("collect", async (interaction)   => {
      await interaction.deferUpdate();
      const player   =client.music?.getPlayer(interaction.guildId);

      switch (interaction.customId) {
        case "lyrics_prev":
          if (currentPage > 0) {
            currentPage--;
            const container   =this._buildLyricsContainer(
              track,
              lyricsData,
              pages[currentPage],
              currentPage,
              pages.length,
            );
            await interaction.editReply({ components: [container] });
          }
          break;
        case "lyrics_next":
          if (currentPage < pages.length - 1) {
            currentPage++;
            const container   =this._buildLyricsContainer(
              track,
              lyricsData,
              pages[currentPage],
              currentPage,
              pages.length,
            );
            await interaction.editReply({ components: [container] });
          }
          break;
        case "lyrics_sync":
          if (!player || !player.playing) {
            interaction.followUp({
              content: "Player is not active. Cannot start sync.",
              ephemeral: true,
            });
            return;
          }
          if (isSyncing) {
            this._stopSync(interaction.guildId, userId);
            isSyncing   =false;
            const container   =this._buildLyricsContainer(
              track,
              lyricsData,
              pages[currentPage],
              currentPage,
              pages.length,
            );
            await interaction.editReply({ components: [container] });
          } else {
            isSyncing   =true;
            this._startSyncMode(interaction, player, lyricsData);
          }
          break;
        case "lyrics_close":
          collector.stop("closed");
          await message.delete().catch(()   => {});
          break;
      }
    });

    collector.on("end", (collected, reason)   => {
      if (reason   !=="closed") {
        this._disableComponents(message);
      }
      this._stopSync(context.guildId, userId);
    });
  }

  _startSyncMode(interaction, player, lyricsData) {
    const sessionKey   =`${interaction.guildId}-${interaction.user.id}`;
    if (activeSyncSessions.has(sessionKey)) {
      activeSyncSessions.get(sessionKey).stop();
    }

    const lines   =this._parseSyncedLyrics(lyricsData.syncedLyrics);
    if (!lines.length) {
      interaction.followUp({
        content: "Synced lyrics format is invalid or empty.",
        ephemeral: true,
      });
      return;
    }

    let isActive   =true;
    const syncSession   ={
      stop: ()   => {
        isActive   =false;
        clearInterval(interval);
      },
    };
    activeSyncSessions.set(sessionKey, syncSession);

    const interval   =setInterval(async ()   => {
      if (
        !isActive ||
        !player.playing ||
        player.queue.current.info.identifier   !==player.queue.current.info.identifier
      ) {
        syncSession.stop();
        activeSyncSessions.delete(sessionKey);
        return;
      }

      const container   =this._buildSyncContainer(player, lyricsData, lines);
      await interaction.editReply({ components: [container] }).catch(()   => {
        syncSession.stop();
        activeSyncSessions.delete(sessionKey);
      });
    }, 1500);
  }

  _stopSync(guildId, userId) {
    const sessionKey   =`${guildId}-${userId}`;
    if (activeSyncSessions.has(sessionKey)) {
      activeSyncSessions.get(sessionKey).stop();
      activeSyncSessions.delete(sessionKey);
    }
  }

  _buildLyricsContainer(
    track,
    lyricsData,
    pageContent,
    currentPage,
    totalPages,
  ) {
    const container   =new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`Lyrics for: ${lyricsData.title}`),
        new TextDisplayBuilder().setContent(`By: ${lyricsData.artist}`),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(pageContent),
      );

    if (totalPages > 1) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Page ${currentPage + 1} of ${totalPages}`,
        ),
      );
    }

    const row   =new ActionRowBuilder();
    if (totalPages > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("lyrics_prev")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage   ===0),
        new ButtonBuilder()
          .setCustomId("lyrics_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage   ===totalPages - 1),
      );
    }

    if (lyricsData.hasSync) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("lyrics_sync")
          .setLabel("Start Sync")
          .setStyle(ButtonStyle.Success),
      );
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId("lyrics_close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger),
    );

    container.addActionRowComponents(row);
    return container;
  }

  _buildSyncContainer(player, lyricsData, lines) {
    const currentTime   =player.position / 1000;

    let currentIndex   =lines.findIndex((line)   => line.time > currentTime) - 1;
    if (currentIndex < 0) currentIndex   =0;

    const windowSize   =7;
    const start   =Math.max(0, currentIndex - Math.floor(windowSize / 2));
    const end   =Math.min(lines.length, start + windowSize);
    const visibleLines   =lines.slice(start, end);

    const lyricsContent   =visibleLines
        .map((line, index)   => {
          const globalIndex   =start + index;
          return globalIndex   ===currentIndex
            ? `**> ${line.text}**`
            : `  ${line.text}`;
        })
        .join("\n") || "Waiting for lyrics...";

    const container   =new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`Live Lyrics: ${lyricsData.title}`),
        new TextDisplayBuilder().setContent(`By: ${lyricsData.artist}`),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(lyricsContent),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Time: ${this._formatDuration(player.position)} / ${this._formatDuration(player.queue.current.info.duration)}`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("lyrics_sync")
            .setLabel("Stop Sync")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("lyrics_close")
            .setLabel("Close")
            .setStyle(ButtonStyle.Secondary),
        ),
      );

    return container;
  }

  _createLoadingContainer(track) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Searching for lyrics...`),
      new TextDisplayBuilder().setContent(
        `Track: "${track.info.title}" by ${track.info.author}`,
      ),
    );
  }

  _createErrorContainer(message) {
    return new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Error"),
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      new TextDisplayBuilder().setContent(message),
    );
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  _splitLyrics(lyrics, maxLength = 1000) {
    const lines = lyrics.split("\n");
    const pages = [];
    let currentPage = "";
    for (const line of lines) {
      if (currentPage.length + line.length + 1 > maxLength) {
        pages.push(currentPage);
        currentPage = line;
      } else {
        currentPage += `\n${line}`;
      }
    }
    pages.push(currentPage.trim());
    return pages.filter((page) => page);
  }

  _parseSyncedLyrics(syncedLyrics) {
    if (!syncedLyrics) return [];
    return syncedLyrics
      .split("\n")
      .map((line)   => {
        const match   =line.match(/\[(\d{ 2 }):(\d{ 2 })\.(\d{ 2, 3 })\](.*)/);
        if (!match) return null;
        const [, min, sec, ms, text]   =match;
        const time   =parseInt(min, 10) * 60 + parseInt(sec, 10) + parseInt(ms, 10) / 1000;
        return { time, text: text.trim() };
      })
      .filter((line)   => line && line.text);
  }

  async _reply(context, container) {
    const payload   ={
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    if (context.replied || context.deferred) return context.editReply(payload);
    return context.reply(payload);
  }

  async _updateMessage(message, container, context) {
    const payload   ={
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    if (context.replied || context.deferred) return context.editReply(payload);
    return message.edit(payload);
  }

  async _disableComponents(message) {
    try {
      const fetchedMessage   =await message.fetch().catch(()   => null);
      if (!fetchedMessage || !fetchedMessage.components.length) return;

      const disabledRows   =fetchedMessage.components.map((row)   => {
        const newRow   =ActionRowBuilder.from(row);
        newRow.components.forEach((component)   => component.setDisabled(true));
        return newRow;
      });

      await fetchedMessage.edit({ components: disabledRows });
    } catch (error) {
      if (error.code   !==10008) {
        logger.error("LyricsCommand", "Failed to disable components on lyrics message:", error);
      }
    }
  }
}

export default new LyricsCommand();
