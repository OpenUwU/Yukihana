import { Command } from "#structures/classes/Command";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { spotifyManager } from "#utils/SpotifyManager";
import { logger } from "#utils/logger";

const PLAYLISTS_PER_PAGE   =5;
const TRACKS_PER_PAGE   =5;

class PlaylistsCommand extends Command {
  constructor() {
    super({
      name: "Spotify-playlists",
      description:
        "View and play your linked Spotify playlists with advanced navigation",
      usage: "playlists",
      aliases: ["sp-pl", "spotify-playlists", "sppl"],
      category: "music",
      examples: ["playlists", "pl"],
      cooldown: 5,
      voiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: ["spotify", "playlists"],
        description: "View and play your Spotify playlists",
        options: [],
      },
    });
  }

  async execute({ client, message }) {
    return this._handlePlaylists(client, message, "message");
  }

  async slashExecute({ client, interaction }) {
    return this._handlePlaylists(client, interaction, "interaction");
  }

  async _handlePlaylists(client, context) {
    const userId   =context.user?.id || context.author?.id;
    const guild   =context.guild;

    const spotifyProfile   =db.user.getSpotifyProfile(userId);
    if (!spotifyProfile) {
      return this._reply(
        context,
        this._createErrorContainer(
          "Spotify Not Linked",
          "You haven't linked your Spotify profile yet. Use the `link-spotify` command first."
        )
      );
    }

    const loadingMessage   =await this._reply(
      context,
      this._createLoadingContainer()
    );

    try {
      const playlists   =await spotifyManager.fetchUserPlaylists(
        spotifyProfile.profileUrl
      );

      if (!playlists || playlists.length   ===0) {
        return this._editReply(
          loadingMessage,
          this._createErrorContainer(
            "No Playlists Found",
            "No public playlists were found in your Spotify profile. Make sure your playlists are set to public."
          )
        );
      }

      const message   =await this._editReply(
        loadingMessage,
        this._createPlaylistsContainer(playlists, 1)
      );
      this._setupPlaylistsCollector(message, client, userId, playlists, guild);
    } catch (error) {
      logger.error("PlaylistsCommand", "Error fetching playlists", error);
      return this._editReply(
        loadingMessage,
        this._createErrorContainer(
          "Error",
          "Failed to fetch your Spotify playlists. Please try again later."
        )
      );
    }
  }

  _createLoadingContainer() {
    const thumbnailUrl   =config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    return new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("### Fetching Spotify Playlists")
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("**Loading Your Playlists**"),
            new TextDisplayBuilder().setContent(
              "Please wait while we fetch your Spotify playlists..."
            )
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );
  }

  _createErrorContainer(title, description) {
    const thumbnailUrl   =config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    return new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${title}`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(description)
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );
  }

  _createPlaylistsContainer(playlists, page) {
    const totalPages   =Math.ceil(playlists.length / PLAYLISTS_PER_PAGE);
    const startIdx   =(page - 1) * PLAYLISTS_PER_PAGE;
    const endIdx   =startIdx + PLAYLISTS_PER_PAGE;
    const pagePlaylist   =playlists.slice(startIdx, endIdx);

    const thumbnailUrl   =config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    const container   =new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("### Your Spotify Playlists")
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

    const playlistText   =pagePlaylist
      .map((playlist, index)   => {
        const globalIndex   =startIdx + index + 1;
        return `**${globalIndex}.** ${playlist.name}\n*${playlist.trackCount} tracks*`;
      })
      .join("\n\n");

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("**Available Playlists**"),
          new TextDisplayBuilder().setContent(playlistText),
          new TextDisplayBuilder().setContent(
            `*Page ${page} of ${totalPages} • ${playlists.length} total playlists*`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const selectMenu   =new StringSelectMenuBuilder()
      .setCustomId("playlist_select")
      .setPlaceholder("Choose a playlist to view")
      .setMaxValues(1);

    pagePlaylist.forEach((playlist)   => {
      selectMenu.addOptions({
        label:
          playlist.name.length > 100
            ? playlist.name.slice(0, 97) + "..."
            : playlist.name,
        description: `${playlist.trackCount} tracks`,
        value: playlist.id,
      });
    });

    const actionRow   =new ActionRowBuilder().addComponents(selectMenu);

    if (totalPages > 1) {
      const buttonRow   =new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("playlists_prev")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId("playlists_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );

      container.addActionRowComponents(actionRow, buttonRow);
    } else {
      container.addActionRowComponents(actionRow);
    }

    return container;
  }

  _createPlaylistTracksContainer(playlist, tracks, page, totalPages) {
    const startIdx   =(page - 1) * TRACKS_PER_PAGE;
    const endIdx   =startIdx + TRACKS_PER_PAGE;
    const pageTracks   =tracks.slice(startIdx, endIdx);

    const thumbnailUrl   =playlist.coverUrl ||
      config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    const container   =new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${playlist.name}`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

    const tracksText   =pageTracks
      .map((track, index)   => {
        const globalIndex   =startIdx + index + 1;
        const duration   =track.duration
          ? this._formatDuration(track.duration)
          : "Unknown";
        return `**${globalIndex}.** ${track.name}\n*by ${track.artist} • ${duration}*`;
      })
      .join("\n\n");

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("**Playlist Tracks**"),
          new TextDisplayBuilder().setContent(tracksText),
          new TextDisplayBuilder().setContent(
            `*Page ${page} of ${totalPages} • ${tracks.length} total tracks*`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttonRow1   =new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tracks_prev")
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId("tracks_next")
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
      new ButtonBuilder()
        .setCustomId("play_playlist")
        .setLabel("Play Playlist")
        .setStyle(ButtonStyle.Success)
    );

    const buttonRow2   =new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("back_to_playlists")
        .setLabel("Back to Playlists")
        .setStyle(ButtonStyle.Primary)
    );

    container.addActionRowComponents(buttonRow1, buttonRow2);

    return container;
  }

  _createProcessingContainer(playlistName) {
    const thumbnailUrl   =config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    return new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("### Processing Playlist")
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("**Adding Songs to Queue**"),
            new TextDisplayBuilder().setContent(
              `Processing: **${playlistName}**`
            ),
            new TextDisplayBuilder().setContent("*This may take a moment...*")
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );
  }

  _createSuccessContainer(title, description) {
    const thumbnailUrl   =config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    return new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${title}`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(description)
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );
  }

  _setupPlaylistsCollector(message, client, userId, playlists, guild) {
    const filter   =(i)   => i.user.id   ===userId;
    const collector   =message.createMessageComponentCollector({
      filter,
      time: 300000,
    });

    let currentPage   =1;
    let currentPlaylist   =null;
    let currentTracks   =null;
    let currentTracksPage   =1;
    let viewMode   ="playlists";

    collector.on("collect", async (interaction)   => {
      try {
        await interaction.deferUpdate();

        switch (interaction.customId) {
          case "playlists_prev":
            if (currentPage > 1) {
              currentPage--;
              await interaction.editReply({
                components: [
                  this._createPlaylistsContainer(playlists, currentPage),
                ],
              });
            }
            break;

          case "playlists_next": {
            const totalPlaylistPages   =Math.ceil(
              playlists.length / PLAYLISTS_PER_PAGE
            );
            if (currentPage < totalPlaylistPages) {
              currentPage++;
              await interaction.editReply({
                components: [
                  this._createPlaylistsContainer(playlists, currentPage),
                ],
              });
            }
            break;
          }

          case "playlist_select": {
            const playlistId   =interaction.values[0];
            currentPlaylist   =playlists.find((p)   => p.id   ===playlistId);

            if (!currentPlaylist) {
              await interaction.followUp({
                content: "Playlist not found.",
                ephemeral: true,
              });
              return;
            }

            try {
              currentTracks   =await spotifyManager.fetchPlaylistTracks(
                playlistId
              );
              if (!currentTracks || currentTracks.length   ===0) {
                await interaction.editReply({
                  components: [
                    this._createErrorContainer(
                      "No Tracks Found",
                      `The playlist "${currentPlaylist.name}" has no playable tracks.`
                    ),
                  ],
                });
                return;
              }

              viewMode   ="tracks";
              currentTracksPage   =1;
              const totalTracksPages   =Math.ceil(
                currentTracks.length / TRACKS_PER_PAGE
              );

              await interaction.editReply({
                components: [
                  this._createPlaylistTracksContainer(
                    currentPlaylist,
                    currentTracks,
                    currentTracksPage,
                    totalTracksPages
                  ),
                ],
              });
            } catch (error) {
              logger.error(
                "PlaylistsCommand",
                "Error fetching playlist tracks",
                error
              );
              await interaction.editReply({
                components: [
                  this._createErrorContainer(
                    "Error",
                    "Failed to fetch playlist tracks. Please try again."
                  ),
                ],
              });
            }
            break;
          }

          case "tracks_prev":
            if (currentTracksPage > 1) {
              currentTracksPage--;
              const totalTracksPages   =Math.ceil(
                currentTracks.length / TRACKS_PER_PAGE
              );
              await interaction.editReply({
                components: [
                  this._createPlaylistTracksContainer(
                    currentPlaylist,
                    currentTracks,
                    currentTracksPage,
                    totalTracksPages
                  ),
                ],
              });
            }
            break;

          case "tracks_next": {
            const totalTracksPages   =Math.ceil(
              currentTracks.length / TRACKS_PER_PAGE
            );
            if (currentTracksPage < totalTracksPages) {
              currentTracksPage++;
              await interaction.editReply({
                components: [
                  this._createPlaylistTracksContainer(
                    currentPlaylist,
                    currentTracks,
                    currentTracksPage,
                    totalTracksPages
                  ),
                ],
              });
            }
            break;
          }

          case "back_to_playlists":
            viewMode   ="playlists";
            await interaction.editReply({
              components: [
                this._createPlaylistsContainer(playlists, currentPage),
              ],
            });
            break;

          case "play_playlist":
            await this._handlePlayPlaylist(
              interaction,
              client,
              guild,
              currentPlaylist,
              currentTracks,
              userId
            );
            break;
        }
      } catch (error) {
        logger.error("PlaylistsCommand", "Error in collector", error);
        await interaction
          .followUp({
            content: "An error occurred while processing your request.",
            ephemeral: true,
          })
          .catch(()   => {});
      }
    });

    collector.on("end", ()   => {
      message.edit({ components: [] }).catch(()   => {});
    });
  }

  async _handlePlayPlaylist(interaction, client, guild, playlist, tracks) {
    try {
      const voiceChannel   =interaction.member?.voice?.channel;
      if (!voiceChannel) {
        await interaction.editReply({
          components: [
            this._createErrorContainer(
              "Voice Channel Required",
              "You need to join a voice channel to play music."
            ),
          ],
        });
        return;
      }

      const permissions = voiceChannel.permissionsFor(guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        await interaction.editReply({
          components: [
            this._createErrorContainer(
              "Missing Permissions",
              "I need permission to join and speak in your voice channel."
            ),
          ],
        });
        return;
      }

      await interaction.editReply({
        components: [this._createProcessingContainer(playlist.name)],
      });

      let player = client.music?.getPlayer(guild.id);
      if (!player) {
        player = await client.music.createPlayer({
          guildId: guild.id,
          textChannelId: interaction.channel.id,
          voiceChannelId: voiceChannel.id,
        });
      }

      const pm = new PlayerManager(player);
      let addedCount = 0;
      let failedCount = 0;

      const batchSize = 5;
      for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (track) => {
            try {
              const searchQuery = `${track.artist} ${track.name}`;
              const foundTrack = await spotifyManager.searchTrack(
                client,
                searchQuery,
                interaction.user
              );

              if (foundTrack) {
                await pm.addTracks(foundTrack);
                addedCount++;
              } else {
                failedCount++;
              }
            } catch (error) {
              logger.error(
                "PlaylistsCommand",
                `Error adding track: ${track.name}`,
                error
              );
              failedCount++;
            }
          })
        );

        if (i + batchSize < tracks.length) {
          await new Promise((resolve)   => setTimeout(resolve, 100));
        }
      }

      if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
        await pm.play();
      }

      const successMessage   =`Successfully added **${addedCount}** tracks from **${playlist.name}** to the queue.`;
      const failedMessage   =failedCount > 0
          ? `\n\n*${failedCount} tracks could not be found.*`
          : "";

      await interaction.editReply({
        components: [
          this._createSuccessContainer(
            "Playlist Added",
            successMessage + failedMessage
          ),
        ],
      });
    } catch (error) {
      logger.error("PlaylistsCommand", "Error playing playlist", error);
      await interaction.editReply({
        components: [
          this._createErrorContainer(
            "Error",
            "Failed to add playlist to queue. Please try again."
          ),
        ],
      });
    }
  }

  _formatDuration(ms) {
    const minutes   =Math.floor(ms / 60000);
    const seconds   =Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  async _reply(context, container) {
    const payload   ={
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };

    try {
      if (context.replied || context.deferred) {
        return context.editReply(payload);
      } else if (typeof context.reply   ==="function") {
        return context.reply(payload);
      } else {
        return context.channel.send(payload);
      }
    } catch (error) {
      logger.error("SpotifyPlaylistsCommand", "Error in _reply", error);
      return null;
    }
  }

  async _editReply(message, container) {
    try {
      if (!message) return null;
      return message.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      logger.error("SpotifyPlaylistsCommand", "Error in _editReply", error);
      return null;
    }
  }
}

export default new PlaylistsCommand();
