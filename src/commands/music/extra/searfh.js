import { Command } from "#structures/classes/Command";
import { ActionRowBuilder, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder } from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { db } from "#database/DatabaseManager";
import { config } from "#config/config";
import { logger } from "#utils/logger";

const MAX_RESULTS = 6;

class SearchCommand extends Command {
  constructor() {
    super({
      name: "search",
      description: "Search for music across multiple platforms",
      usage: "search <query> [--src yt/sp/am/sc]",
      aliases: ["find", "lookup", "s"],
      category: "music",
      examples: [
        "search never gonna give you up",
        "search taylor swift --src sp",
        "search lofi hip hop --src yt"
      ],
      cooldown: 5,
      voiceRequired: false,
      enabledSlash: true,
      slashData: {
        name: "search",
        description: "Search for music across multiple platforms",
        options: [
          {
            name: "query",
            description: "What do you want to search for?",
            type: 3,
            required: true,
            autocomplete: true
          },
          {
            name: "source",
            description: "Music source to search from",
            type: 3,
            required: false,
            choices: [
              { name: "Spotify", value: "sp" },
              { name: "YouTube", value: "yt" },
              { name: "Apple Music", value: "am" },
              { name: "SoundCloud", value: "sc" },
              { name: "Deezer", value: "dz" },
              { name: "All Sources", value: "all" }
            ]
          }
        ]
      },
    });
  }

  async execute({ client, message, args }) {
    if (args.length === 0) {
      return message.reply({
        components: [this._createErrorContainer("Please provide a search query.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const { query, source } = this._parseFlags(args);
    return this._handleSearch(client, message, query, source || 'sp');
  }

  async slashExecute({ client, interaction }) {
    const query = interaction.options.getString("query");
    const source = interaction.options.getString("source") || 'sp';
    return this._handleSearch(client, interaction, query, source);
  }

  async _handleSearch(client, context, query, initialSource) {
    const userId = context.user?.id || context.author?.id;
    const guildId = context.guild.id;

    const loadingMessage = await this._reply(context, this._createLoadingContainer(query));
    if (!loadingMessage) {
      return this._reply(context, this._createErrorContainer("Failed to send message."));
    }

    try {
      const searchData = {
        query,
        selectedSource: initialSource,
        currentResults: null,
        guildId,
        userId
      };

      const results = await this._searchTracks(client, query, initialSource);
      searchData.currentResults = results;

      const container = this._createSearchContainer(searchData);
      const message = await this._editReply(loadingMessage, container);

      if (message) {
        this._setupSearchCollector(message, client, userId, guildId, searchData);
      }

    } catch (error) {
      logger.error('SearchCommand', 'Error performing search', error);
      return this._editReply(loadingMessage, this._createErrorContainer(
        "Search failed. Please try again later."
      ));
    }
  }

  async _searchTracks(client, query, source) {
    try {
      if (source === 'all') {
        const sources = ['spsearch', 'ytsearch', 'amsearch', 'scsearch'];
        const results = [];

        for (const src of sources) {
          try {
            const searchResult = await client.music.search(query, { source: src });
            if (searchResult?.tracks?.length > 0) {
              const tracks = searchResult.tracks.slice(0, 2).map(track => ({
                ...track,
                source: this._getSourceName(src),
                sourceKey: src
              }));
              results.push(...tracks);
            }
          } catch (error) {
            logger.warn('SearchCommand', `Failed to search ${src}`, error);
          }
        }

        const uniqueResults = this._removeDuplicateTracks(results);
        return uniqueResults.slice(0, MAX_RESULTS);
      } else {
        const sourceKey = this._normalizeSource(source);
        const searchResult = await client.music.search(query, { source: sourceKey });

        if (searchResult?.tracks?.length > 0) {
          return searchResult.tracks.slice(0, MAX_RESULTS).map(track => ({
            ...track,
            source: this._getSourceName(sourceKey),
            sourceKey: sourceKey
          }));
        }
        return [];
      }
    } catch (error) {
      logger.error('SearchCommand', 'Error searching tracks', error);
      return [];
    }
  }

  _createSearchContainer(searchData) {
    const { query, selectedSource, currentResults, guildId, userId } = searchData;
    const container = new ContainerBuilder();
    const premiumStatus = this._getPremiumStatus(guildId, userId);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Music Search Results`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const resultsCount = currentResults?.length || 0;
    const sourceText = this._getSourceName(this._normalizeSource(selectedSource));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Search Query**`),
          new TextDisplayBuilder().setContent(`"${query}"`),
          new TextDisplayBuilder().setContent(`*Found ${resultsCount} tracks from ${sourceText}*`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork))
    );

    if (currentResults && currentResults.length > 0) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      currentResults.forEach((track, index) => {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${index + 1}. [${track.info.title}](${track.info.uri})**`),
              new TextDisplayBuilder().setContent(`*by ${track.info.author || 'Unknown'} | ${this._formatDuration(track.info.duration)} | ${track.source}*`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.info.artworkUrl || config.assets.defaultTrackArtwork))
        );
      });

      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

      if (premiumStatus.hasPremium) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`*Premium Queue: Up to ${premiumStatus.maxSongs} songs*`)
        );
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`*Free Queue: Up to ${premiumStatus.maxSongs} songs | Upgrade for ${config.queue.maxSongs.premium} songs*`)
        );
      }

      container.addActionRowComponents(this._createSourceSelector(selectedSource));
      container.addActionRowComponents(this._createResultSelector(currentResults, guildId, userId));
    } else {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`*No tracks found. Try a different search term or source.*`)
      );
      container.addActionRowComponents(this._createSourceSelector(selectedSource));
    }

    return container;
  }

  _createSourceSelector(selectedSource) {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('search_source_select')
        .setPlaceholder('Select music source')
        .addOptions([
          {
            label: 'Spotify',
            description: 'Search Spotify for tracks',
            value: 'sp',
            default: selectedSource === 'sp'
          },
          {
            label: 'YouTube',
            description: 'Search YouTube for tracks',
            value: 'yt',
            default: selectedSource === 'yt'
          },
          {
            label: 'Apple Music',
            description: 'Search Apple Music for tracks',
            value: 'am',
            default: selectedSource === 'am'
          },
          {
            label: 'SoundCloud',
            description: 'Search SoundCloud for tracks',
            value: 'sc',
            default: selectedSource === 'sc'
          },
          {
            label: 'Deezer',
            description: 'Search Deezer for tracks',
            value: 'dz',
            default: selectedSource === 'dz'
          },
          {
            label: 'All Sources',
            description: 'Search all available sources',
            value: 'all',
            default: selectedSource === 'all'
          }
        ])
    );
  }

  _createResultSelector(results, guildId, userId) {
    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const maxSelections = Math.min(results.length, 6, premiumStatus.maxSongs);

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`search_result_select_${guildId}`)
      .setPlaceholder(`Select up to ${maxSelections} tracks to add to queue`)
      .setMinValues(1)
      .setMaxValues(maxSelections);

    results.forEach((track, index) => {
      const title = track.info.title.length > 90 ? track.info.title.substring(0, 87) + '...' : track.info.title;
      const author = (track.info.author || 'Unknown').length > 30 ? (track.info.author || 'Unknown').substring(0, 27) + '...' : (track.info.author || 'Unknown');

      menu.addOptions({
        label: title,
        description: `${author} | ${track.source}`,
        value: index.toString()
      });
    });

    return new ActionRowBuilder().addComponents(menu);
  }

  _setupSearchCollector(message, client, userId, guildId, searchData) {
    const filter = (i) => {
      return i.user.id === userId && (
        i.customId === 'search_source_select' ||
        i.customId === `search_result_select_${guildId}`
      );
    };

    const collector = message.createMessageComponentCollector({
      filter,
      time: 300000,
      max: 50
    });

    collector.on('collect', async (interaction) => {
      try {
        if (interaction.customId === 'search_source_select') {
          await this._handleSourceSelect(interaction, client, searchData, message);
        } else if (interaction.customId === `search_result_select_${guildId}`) {
          await this._handleResultSelect(interaction, client, guildId, searchData, message);
        }
      } catch (error) {
        logger.error('SearchCommand', 'Error in collector', error);
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: 'An error occurred while processing your request.',
              ephemeral: true
            });
          } catch (err) {
            logger.error('SearchCommand', 'Error sending error reply', err);
          }
        } else if (interaction.deferred) {
          try {
            await interaction.editReply({
              content: 'An error occurred while processing your request.'
            });
          } catch (err) {
            logger.error('SearchCommand', 'Error editing deferred reply', err);
          }
        }
      }
    });

    collector.on('end', async (collected, reason) => {
      logger.debug('SearchCommand', `Collector ended: ${reason}, collected: ${collected.size}`);

      try {
        const currentMessage = await message.fetch().catch(() => null);
        if (!currentMessage || !currentMessage.components || currentMessage.components.length === 0) return;

        const newContainer = this._createDisabledContainer(searchData);
        await currentMessage.edit({
          components: [newContainer],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (error) {
        logger.error('SearchCommand', 'Error disabling components', error);
      }
    });
  }

  _createDisabledContainer(searchData) {
    const container = this._createSearchContainer(searchData);

    if (container.components) {
      container.components.forEach(component => {
        if (component.type === 1) {
          component.components.forEach(child => {
            if (child.type === 3 || child.type === 2) {
              child.data.disabled = true;
            }
          });
        }
      });
    }

    return container;
  }

  async _handleSourceSelect(interaction, client, searchData, message) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    const selectedSource = interaction.values[0];
    searchData.selectedSource = selectedSource;

    try {
      const results = await this._searchTracks(client, searchData.query, selectedSource);
      searchData.currentResults = results;

      const container = this._createSearchContainer(searchData);
      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      logger.error('SearchCommand', 'Error searching with new source', error);
      searchData.currentResults = [];
      await interaction.editReply({
        components: [this._createSearchContainer(searchData)],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }

  async _handleResultSelect(interaction, client, guildId, searchData, message) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const selectedIndices = interaction.values.map(v => parseInt(v, 10));
    const { currentResults } = searchData;

    if (!currentResults || selectedIndices.some(i => i >= currentResults.length || i < 0)) {
      await interaction.editReply({
        content: 'Invalid selection. Please try again.'
      });
      return;
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      await interaction.editReply({
        components: [this._createErrorContainer("You need to join a voice channel to add music to queue.")],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has(['Connect', 'Speak'])) {
      await interaction.editReply({
        components: [this._createErrorContainer("I need permission to join and speak in your voice channel.")],
        flags: MessageFlags.IsComponentsV2
      });
      return;
    }

    await interaction.editReply({
      components: [this._createProcessingContainer(selectedIndices.length)],
      flags: MessageFlags.IsComponentsV2
    });

    try {
      await message.delete();
    } catch (error) {
      logger.warn('SearchCommand', 'Could not delete original message', error);
    }

    await this._addTracksToQueue(interaction, client, guildId, currentResults, selectedIndices);
  }

  async _addTracksToQueue(interaction, client, guildId, tracks, selectedIndices) {
    try {
      const voiceChannel = interaction.member.voice.channel;
      const userId = interaction.user.id;

      let player = client.music?.getPlayer(guildId);
      if (!player) {
        player = await client.music.createPlayer({
          guildId: guildId,
          textChannelId: interaction.channel.id,
          voiceChannelId: voiceChannel.id
        });
      }

      const pm = new PlayerManager(player);

      if (!pm.isConnected) {
        await pm.connect();
      }

      const currentQueueSize = pm.queue.tracks.length;
      const selectedCount = selectedIndices.length;

      const queueLimitCheck = this._checkQueueLimit(currentQueueSize, selectedCount, guildId, userId);

      if (!queueLimitCheck.allowed) {
        await interaction.editReply({
          components: [this._createErrorContainer(queueLimitCheck.message, true)],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      const wasEmpty = pm.queue.tracks.length === 0 && !pm.isPlaying;
      const selectedTracks = selectedIndices.map(i => tracks[i]);
      const tracksToAdd = queueLimitCheck.canAddAll ? selectedTracks : selectedTracks.slice(0, queueLimitCheck.tracksToAdd);

      const addedTracks = [];
      for (const track of tracksToAdd) {
        try {
          await pm.addTracks(track);
          addedTracks.push(track);
        } catch (error) {
          logger.error('SearchCommand', `Failed to add track: ${track.info.title}`, error);
        }
      }

      if (addedTracks.length === 0) {
        await interaction.editReply({
          components: [this._createErrorContainer("Failed to add any tracks to queue. Please try again.")],
          flags: MessageFlags.IsComponentsV2
        });
        return;
      }

      if (wasEmpty && addedTracks.length > 0) {
        await pm.play();
      }

      const addedCount = addedTracks.length;

      let successMessage;
      if (wasEmpty && addedCount > 0) {
        successMessage = addedCount === 1
          ? `**Now Playing:** [${addedTracks[0].info.title}](${addedTracks[0].info.uri})`
          : `**Now Playing:** [${addedTracks[0].info.title}](${addedTracks[0].info.uri})\n*+ ${addedCount - 1} more tracks added to queue*`;
      } else {
        successMessage = `**Added ${addedCount} track${addedCount > 1 ? 's' : ''} to queue**`;
      }

      if (!queueLimitCheck.canAddAll) {
        const premiumStatus = queueLimitCheck.premiumStatus;
        const limitWarning = premiumStatus.hasPremium
          ? `\n*Premium queue limit reached*`
          : `\n*Free tier limit reached - upgrade for ${config.queue.maxSongs.premium} songs*`;
        successMessage += limitWarning;
      }

      await interaction.editReply({
        components: [this._createSuccessContainer("Tracks Added", successMessage)],
        flags: MessageFlags.IsComponentsV2
      });

    } catch (error) {
      logger.error('SearchCommand', 'Error adding tracks to queue', error);
      await interaction.editReply({
        components: [this._createErrorContainer("Failed to add tracks to queue. Please try again.")],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }

  _createLoadingContainer(query) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Searching Music")
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("**Finding Results**"),
          new TextDisplayBuilder().setContent(`Searching for: **${query}**`),
          new TextDisplayBuilder().setContent("*Please wait while we search across platforms...*")
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork))
    );

    return container;
  }

  _createErrorContainer(message, isPremiumLimit = false) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${isPremiumLimit ? 'Queue Limit Reached' : 'Search Error'}`)
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${isPremiumLimit ? 'Queue Full' : 'Unable to Search'}**`),
          new TextDisplayBuilder().setContent(message)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork))
    );

    return container;
  }

  _createProcessingContainer(count) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Processing Selection")
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("**Adding to Queue**"),
          new TextDisplayBuilder().setContent(`Processing ${count} track${count > 1 ? 's' : ''}...`),
          new TextDisplayBuilder().setContent("*This may take a moment...*")
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork))
    );

    return container;
  }

  _createSuccessContainer(title, description) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(description)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultTrackArtwork))
    );

    return container;
  }

  _checkQueueLimit(currentQueueSize, tracksToAdd, guildId, userId) {
    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const availableSlots = premiumStatus.maxSongs - currentQueueSize;

    if (availableSlots <= 0) {
      const limitMessage = premiumStatus.hasPremium
        ? `Premium queue is full! You can have up to **${premiumStatus.maxSongs}** songs in queue.`
        : `Free tier queue is full! You can have up to **${premiumStatus.maxSongs}** songs in queue.\n*Upgrade to premium for up to **${config.queue.maxSongs.premium}** songs!*`;

      return { allowed: false, message: limitMessage };
    }

    const canAddAll = tracksToAdd <= availableSlots;
    const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;

    return {
      allowed: true,
      canAddAll,
      tracksToAdd: tracksToAddActual,
      availableSlots,
      premiumStatus
    };
  }

  _getPremiumStatus(guildId, userId) {
    const premiumStatus = db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : 'free',
      maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free
    };
  }

  _removeDuplicateTracks(tracks) {
    const seen = new Set();
    return tracks.filter(track => {
      const key = `${track.info.title.toLowerCase()}_${track.info.author?.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _getSourceName(source) {
    const sourceNames = {
      'ytsearch': 'YouTube',
      'spsearch': 'Spotify',
      'amsearch': 'Apple Music',
      'scsearch': 'SoundCloud',
      'dzsearch': 'Deezer',
      'sp': 'Spotify',
      'yt': 'YouTube',
      'am': 'Apple Music',
      'sc': 'SoundCloud',
      'dz': 'Deezer',
      'all': 'All Sources'
    };
    return sourceNames[source] || 'Unknown';
  }

  _normalizeSource(source) {
    const sourceMap = {
      yt: "ytsearch", youtube: "ytsearch",
      sp: "spsearch", spotify: "spsearch",
      am: "amsearch", apple: "amsearch",
      sc: "scsearch", soundcloud: "scsearch",
      dz: "dzsearch", deezer: "dzsearch",
      all: "all"
    };
    return sourceMap[source?.toLowerCase()] || "spsearch";
  }

  _parseFlags(args) {
    const flags = { query: [], source: null };
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--src" || arg === "--source") {
        if (i + 1 < args.length) flags.source = args[++i];
      } else if (!arg.startsWith("--")) {
        flags.query.push(arg);
      }
    }
    return { query: flags.query.join(" "), source: flags.source };
  }

  _formatDuration(ms) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }

  async _reply(context, container) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    };

    try {
      if (context.replied || context.deferred) {
        return await context.editReply(payload);
      } else if (typeof context.reply === 'function') {
        return await context.reply(payload);
      } else {
        return await context.channel.send(payload);
      }
    } catch (error) {
      logger.error('SearchCommand', 'Error in _reply', error);
      return null;
    }
  }

  async _editReply(message, container) {
    try {
      if (!message) return null;
      return await message.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      logger.error('SearchCommand', 'Error in _editReply', error);
      return null;
    }
  }
}

export default new SearchCommand();