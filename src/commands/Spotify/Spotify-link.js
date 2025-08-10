import { Command } from "#structures/classes/Command";
import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { spotifyManager } from "#utils/SpotifyManager";
import { logger } from "#utils/logger";

class LinkSpotifyCommand extends Command {
  constructor() {
    super({
      name: "link-spotify",
      description: "Link your Spotify profile to access your public playlists",
      usage: "link-spotify <spotify profile URL>",
      aliases: ["spotify-link", "connect-spotify"],
      category: "music",
      examples: [
        "link-spotify https://open.spotify.com/user/your_username",
        "spotify-link https://open.spotify.com/user/123456789",
      ],
      cooldown: 5,
      enabledSlash: true,
      slashData: {
        name: "link-spotify",
        description: "Link your Spotify profile to access playlists",
        options: [
          {
            name: "profile_url",
            description: "Your Spotify profile URL",
            type: 3,
            required: true,
          },
        ],
      },
    });
  }

  async execute({ client, message, args }) {
    if (args.length   ===0) {
      return message.reply({
        components: [
          this._createErrorContainer(
            "Missing Profile URL",
            `Please provide your Spotify profile URL.\n\nUsage: \`${this.usage}\``
          ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    return this._handleLink(message.author, args[0], message);
  }

  async slashExecute({ client, interaction }) {
    const profileUrl   =interaction.options.getString("profile_url");
    return this._handleLink(interaction.user, profileUrl, interaction);
  }

  async _handleLink(user, profileUrl, context) {
    const parsed   =spotifyManager.parseSpotifyUrl(profileUrl);
    if (!parsed || parsed.type   !=="user") {
      return this._reply(
        context,
        this._createErrorContainer(
          "Invalid Spotify URL",
          "Please provide a valid Spotify profile URL.\n\nExample: `https://open.spotify.com/user/your_username`"
        )
      );
    }

    const loadingMessage   =await this._reply(
      context,
      this._createLoadingContainer()
    );

    try {
      const userData   =await spotifyManager.fetchUserData(profileUrl);

      if (!userData) {
        return this._editReply(
          loadingMessage,
          this._createErrorContainer(
            "Profile Not Found",
            "Could not find the Spotify profile. Please check the URL and try again."
          )
        );
      }

      db.user.linkSpotifyProfile(user.id, profileUrl, userData.displayName);

      let playlistCount   =0;
      try {
        const playlists   =await spotifyManager.fetchUserPlaylists(profileUrl);
        playlistCount   =playlists ? playlists.length : 0;
      } catch (error) {
        logger.warn(
          "LinkSpotifyCommand",
          "Could not fetch playlists count",
          error
        );
      }

      return this._editReply(
        loadingMessage,
        this._createSuccessContainer(userData, playlistCount)
      );
    } catch (error) {
      logger.error(
        "LinkSpotifyCommand",
        "Error linking Spotify profile",
        error
      );
      return this._editReply(
        loadingMessage,
        this._createErrorContainer(
          "Error",
          "An error occurred while linking your Spotify profile. Please try again later."
        )
      );
    }
  }

  _createLoadingContainer() {
    const thumbnailUrl   =config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    return new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("### Verifying Spotify Profile")
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("**Connecting to Spotify**"),
            new TextDisplayBuilder().setContent(
              "Please wait while we verify your Spotify profile..."
            )
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );
  }

  _createErrorContainer(title, description) {
    const thumbnailUrl = config.assets?.defaultTrackArtwork ||
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

  _createSuccessContainer(userData, playlistCount) {
    const thumbnailUrl = userData.images?.[0]?.url ||
      config.assets?.defaultTrackArtwork ||
      "https://cdn.discordapp.com/embed/avatars/2.png";

    let description = `Successfully linked to Spotify profile: **${userData.displayName}**`;

    if (playlistCount > 0) {
      description += `\n\nFound **${playlistCount}** public playlist${playlistCount > 1 ? "s" : ""
     }. Use \`playlists\` to view them.`;
    } else {
      description += `\n\n*No public playlists found. Make sure your playlists are set to public to use them with this bot.*`;
    }

    return new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("### Spotify Profile Linked")
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("**Connection Successful**"),
            new TextDisplayBuilder().setContent(description)
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
      );
  }

  async _reply(context, container) {
    if (context.replied || context.deferred) {
      return context.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } else if (context.reply) {
      return context.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
      return context.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  async _editReply(message, container) {
    return message.edit({ components: [container] });
  }
}

export default new LinkSpotifyCommand();
