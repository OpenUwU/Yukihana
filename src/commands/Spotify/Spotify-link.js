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
import emoji from "#config/emoji";

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
        name:["spotify","link"],
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
    if (args.length === 0) {
      return message.reply({
        components: [this._createUsageContainer()],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    return this._handleLink(message.author, args[0], message);
  }

  async slashExecute({ client, interaction }) {
    const profileUrl = interaction.options.getString("profile_url");
    return this._handleLink(interaction.user, profileUrl, interaction);
  }

  async _handleLink(user, profileUrl, context) {
    const parsed = spotifyManager.parseSpotifyUrl(profileUrl);
    if (!parsed || parsed.type !== "user") {
      return this._reply(context, this._createInvalidUrlContainer());
    }

    const loadingMessage = await this._reply(
      context,
      this._createLoadingContainer(),
    );

    try {
      const userData = await spotifyManager.fetchUserData(profileUrl);

      if (!userData) {
        return this._editReply(loadingMessage, this._createNotFoundContainer());
      }

      db.user.linkSpotifyProfile(user.id, profileUrl, userData.displayName);

      let playlistCount = 0;
      try {
        const playlists = await spotifyManager.fetchUserPlaylists(profileUrl);
        playlistCount = playlists ? playlists.length : 0;
      } catch (error) {
        logger.warn(
          "LinkSpotifyCommand",
          "Could not fetch playlists count",
          error,
        );
      }

      return this._editReply(
        loadingMessage,
        this._createSuccessContainer(userData, playlistCount),
      );
    } catch (error) {
      logger.error(
        "LinkSpotifyCommand",
        "Error linking Spotify profile",
        error,
      );
      return this._editReply(
        loadingMessage,
        this._createErrorContainer(
          "An error occurred while linking your Spotify profile. Please try again later.",
        ),
      );
    }
  }

  _createUsageContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("info")} **Link Spotify Profile**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Missing Profile URL**\n\n` +
      `**${emoji.get("cross")} Status:** URL Required\n\n` +
      `Please provide your Spotify profile URL to link your account.\n\n` +
      `**${emoji.get("info")} Usage:**\n` +
      `├─ \`link-spotify <profile_url>\`\n` +
      `├─ \`spotify-link <profile_url>\`\n` +
      `└─ \`connect-spotify <profile_url>\`\n\n` +
      `**${emoji.get("folder")} Example:**\n` +
      `\`link-spotify https://open.spotify.com/user/your_username\`\n\n` +
      `*Get your profile URL from the Spotify app or web player*`;

    const thumbnailUrl =
      config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    return container;
  }

  _createLoadingContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("loading")} **Connecting to Spotify**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Verifying Spotify Profile**\n\n` +
      `**${emoji.get("loading")} Status:** Connecting\n\n` +
      `Please wait while we verify your Spotify profile and fetch your data.\n\n` +
      `*This may take a few seconds...*`;

    const thumbnailUrl =
      config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    return container;
  }

  _createInvalidUrlContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("cross")} **Invalid Spotify URL**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Invalid Profile URL Format**\n\n` +
      `**${emoji.get("cross")} Status:** URL Invalid\n\n` +
      `Please provide a valid Spotify profile URL.\n\n` +
      `**${emoji.get("check")} Valid Format:**\n` +
      `├─ \`https://open.spotify.com/user/username\`\n` +
      `├─ \`https://open.spotify.com/user/123456789\`\n` +
      `└─ Must be a user profile URL\n\n` +
      `**${emoji.get("info")} How to get your URL:**\n` +
      `├─ Open Spotify app or web player\n` +
      `├─ Go to your profile\n` +
      `├─ Click the three dots (...)\n` +
      `└─ Select "Copy link to profile"\n\n` +
      `*Try again with a valid profile URL*`;

    const thumbnailUrl =
      config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    return container;
  }

  _createNotFoundContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("cross")} **Profile Not Found**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const content =
      `**Spotify Profile Not Accessible**\n\n` +
      `**${emoji.get("cross")} Status:** Profile Not Found\n\n` +
      `Could not access the Spotify profile at the provided URL.\n\n` +
      `**${emoji.get("info")} Possible Issues:**\n` +
      `├─ Profile URL is incorrect\n` +
      `├─ Profile is set to private\n` +
      `├─ Profile has been deleted\n` +
      `└─ Temporary Spotify API issue\n\n` +
      `**${emoji.get("reset")} Solutions:**\n` +
      `├─ Double-check your profile URL\n` +
      `├─ Make sure your profile is public\n` +
      `└─ Try again in a few minutes\n\n` +
      `*Please verify your profile URL and try again*`;

    const thumbnailUrl =
      config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    return container;
  }

  _createSuccessContainer(userData, playlistCount) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.get("check")} **Profile Linked Successfully**`,
      ),
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const linkedDate = new Date().toLocaleDateString();

    let playlistInfo = "";
    if (playlistCount > 0) {
      playlistInfo =
        `**${emoji.get("folder")} Public Playlists:** ${playlistCount} found\n\n` +
        `**${emoji.get("info")} Next Steps:**\n` +
        `├─ Use \`spotify-playlists\` to view your playlists\n` +
        `└─ Access enhanced Spotify features\n\n`;
    } else {
      playlistInfo =
        `**${emoji.get("folder")} Public Playlists:** None found\n\n` +
        `**${emoji.get("info")} Note:**\n` +
        `├─ Make your playlists public to use them\n` +
        `├─ You can still access other Spotify features\n` +
        `└─ Re-link anytime to refresh playlist data\n\n`;
    }

    const content =
      `**Spotify profile successfully linked**\n\n` +
      `**${emoji.get("check")} Profile:** ${userData.displayName || "Unknown"}\n` +
      `**${emoji.get("info")} Linked On:** ${linkedDate}\n` +
      `${playlistInfo}` +
      `*Welcome to Spotify integration!*`;

    const thumbnailUrl =
      userData.images?.[0]?.url ||
      config.assets?.defaultThumbnail ||
      config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

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

    const thumbnailUrl =
      config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    return container;
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
