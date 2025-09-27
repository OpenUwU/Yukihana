import { logger } from "#utils/logger";
import { db } from '#database/DatabaseManager';
import { config } from "#config/config";
import { PlayerManager } from "#managers/PlayerManager";
import { EventUtils } from "#utils/EventUtils";

const LASTFM_API_KEY = config.lastfm.apiKey
const LASTFM_BASE_URL = "http://ws.audioscrobbler.com/2.0/";

export default {
  name: "queueEnd",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      logger.info('QueueEnd', `Queue ended in guild ${player.guildId}`);

      const messageId = player.get('nowPlayingMessageId');
      const channelId = player.get('nowPlayingChannelId');
      EventUtils.clearPlayerTimeout(player, 'stuckTimeoutId');

      if (messageId && channelId) {
        try {
          const channel = client.channels.cache.get(channelId);
          const message = await channel?.messages.fetch(messageId).catch(() => null);

          if (message) {
            await message.edit({
              content: `🏁 **Queue Complete** - All songs have finished playing.`,
              files: []
            });

            setTimeout(async () => {
              try {
                await message.delete().catch(() => {});
              } catch (deleteError) {
                logger.debug('QueueEnd', 'Could not delete queue end message:', deleteError);
              }
            }, 10000);
          }
        } catch (messageError) {
          logger.debug('QueueEnd', 'Error handling queue end message:', messageError);
        }
      }

      const autoplayEnabled = player.get('autoplayEnabled') || false;
      const lastTrack = player.get('lastPlayedTrack') || track;

      if (autoplayEnabled && lastTrack) {
        logger.info('QueueEnd', `Autoplay enabled - attempting to add similar tracks for guild ${player.guildId}`);

        try {
          await handleAutoplay(player, lastTrack, client);
          return;
        } catch (autoplayError) {
          logger.error('QueueEnd', 'Autoplay failed:', autoplayError);

          await EventUtils.sendPlayerMessage(client, player, {
            content: `⚠️ **Autoplay failed** - Unable to find similar songs. Queue has ended.`
          });
        }
      }

      let shouldDisconnect = true;
      let is247Mode = false;
      
      try {
        const guild247Settings = db.guild.get247Settings(player.guildId);
        is247Mode = guild247Settings.enabled;
        shouldDisconnect = !is247Mode && guild247Settings.autoDisconnect;
        
        logger.debug('QueueEnd', `Guild ${player.guildId} settings: 24/7 = ${is247Mode}, autoDisconnect = ${guild247Settings.autoDisconnect}`);
      } catch (dbError) {
        logger.debug('QueueEnd', 'Could not check guild disconnect settings:', dbError);
      }

      const completionMessage = await EventUtils.sendPlayerMessage(client, player, {
        content: is247Mode
          ? `🏁 **Queue Complete!** All songs have finished playing.\n♾️ **24/7 Mode:** Bot will stay connected.`
          : shouldDisconnect
          ? `🏁 **Queue Complete!** All songs have finished playing.\n⏰ Disconnecting in 60 seconds...`
          : `🏁 **Queue Complete!** All songs have finished playing.`
      });

      if (completionMessage?.id) {
        player.set('queueEndMessageId', completionMessage.id);
      }

      clearStoredMessageIds(player);

      if (shouldDisconnect && !is247Mode) {
        const disconnectTimeoutId = setTimeout(async () => {
          try {
            if (player && player.queue.tracks.length === 0 && !player.queue.current) {
              const current247Settings = db.guild.get247Settings(player.guildId);
              if (!current247Settings.enabled) {
                logger.info('QueueEnd', `Auto-disconnecting from guild ${player.guildId} after queue completion`);

                await EventUtils.sendPlayerMessage(client, player, {
                  content: `👋 **Disconnected** - Thanks for listening!`
                });

                await player.destroy();
              } else {
                logger.info('QueueEnd', `24/7 mode enabled - cancelling auto-disconnect for guild ${player.guildId}`);
              }
            }
          } catch (disconnectError) {
            logger.error('QueueEnd', 'Error during auto-disconnect:', disconnectError);
          }
        }, 60000);

        player.set('disconnectTimeoutId', disconnectTimeoutId);
      } else if (is247Mode) {
        logger.info('QueueEnd', `24/7 mode active - keeping connection for guild ${player.guildId}`);
        player.set('247Mode', true);
        
        EventUtils.clearPlayerTimeout(player, 'disconnectTimeoutId');
      }

      logSessionStats(player);

    } catch (error) {
      logger.error('QueueEnd', 'Error in queueEnd event:', error);

      try {
        await EventUtils.sendPlayerMessage(client, player, {
          content: `🏁 **Queue finished.** Use a music command to start playing again.`
        });
      } catch (fallbackError) {
        logger.error('QueueEnd', 'Even fallback queue end message failed:', fallbackError);
      }
    }
  }
};

async function handleAutoplay(player, lastTrack, client) {
  if (!lastTrack?.info) {
    throw new Error('No valid last track for autoplay');
  }

  const autoplayMessage = await EventUtils.sendPlayerMessage(client, player, {
    content: `🔄 **Autoplay activated** - Finding similar songs to "${lastTrack.info.title}" by ${lastTrack.info.author}...`
  });

  let targetTrack = lastTrack;

  if (!isSpotifySource(lastTrack)) {
    try {
      const searchQuery = `${lastTrack.info.author} ${lastTrack.info.title}`;
      const spotifyResult = await client.music.search(searchQuery, {
        source: "spsearch"
      });

      if (spotifyResult?.tracks?.length > 0) {
        targetTrack = spotifyResult.tracks[0];
        const originalSource = getTrackSource(lastTrack);
        logger.debug('QueueEnd', `Found Spotify version for autoplay (original: ${originalSource}): ${targetTrack.info.title}`);
      } else {
        logger.debug('QueueEnd', `No Spotify version found for ${lastTrack.info.title}, using original track from ${getTrackSource(lastTrack)}`);
      }
    } catch (spotifyError) {
      logger.warn('QueueEnd', `Could not find Spotify version for ${getTrackSource(lastTrack)} track, using original:`, spotifyError);
    }
  } else {
    logger.debug('QueueEnd', 'Track is already from Spotify, using original for autoplay');
  }

  const recommendations = await fetchRecommendations(targetTrack, client);

  if (!recommendations?.length) {
    throw new Error('No recommendations found for autoplay');
  }

  const autoplayUserId = player.get('autoplaySetBy');
  const premiumStatus = getPremiumStatus(player.guildId, autoplayUserId);
  const maxAutoplayTracks = premiumStatus.hasPremium ? 10 : 6;

  const tracksToAdd = recommendations.slice(0, maxAutoplayTracks);
  const pm = new PlayerManager(player);

  let addedCount = 0;
  const addedTracks = [];

  for (const rec of tracksToAdd) {
    try {
      let searchResult;

      if (rec.trackInfo) {
        searchResult = { tracks: [rec.trackInfo] };
      } else {
        const query = `${rec.artist} ${rec.name}`;
        searchResult = await client.music.search(query, {
          source: "spsearch"
        });
      }

      if (searchResult?.tracks?.length > 0) {
        await pm.addTracks(searchResult.tracks[0]);
        addedTracks.push(`"${rec.name}" by ${rec.artist}`);
        addedCount++;
      }
    } catch (trackError) {
      logger.warn('QueueEnd', `Failed to add autoplay track: ${rec.name}`, trackError);
    }
  }

  if (addedCount === 0) {
    throw new Error('Failed to add any autoplay tracks');
  }

  if (!pm.isPlaying && pm.queue.tracks.length > 0) {
    await pm.play();
  }

  if (autoplayMessage) {
    try {
      const successContent = `✅ **Autoplay Success!** Added ${addedCount} similar songs:\n${addedTracks.slice(0, 3).map((track, i) => `${i + 1}. ${track}`).join('\n')}${addedCount > 3 ? `\n+${addedCount - 3} more...` : ''}`;
      await autoplayMessage.edit({ content: successContent });

      setTimeout(async () => {
        try {
          await autoplayMessage.delete().catch(() => {});
        } catch (deleteError) {
          logger.debug('QueueEnd', 'Could not delete autoplay success message:', deleteError);
        }
      }, 15000);
    } catch (editError) {
      logger.debug('QueueEnd', 'Could not edit autoplay message:', editError);
    }
  }

  logger.info('QueueEnd', `Autoplay added ${addedCount} tracks to guild ${player.guildId}`);
}

function isSpotifySource(track) {
  const uri = track.info.uri?.toLowerCase() || '';
  const sourceName = track.info.sourceName?.toLowerCase() || '';

  return uri.includes('spotify.com') ||
         uri.includes('open.spotify.com') ||
         sourceName.includes('spotify') ||
         sourceName.includes('sp');
}

function isYouTubeSource(track) {
  const uri = track.info.uri?.toLowerCase() || '';
  const sourceName = track.info.sourceName?.toLowerCase() || '';

  return uri.includes('youtube.com') ||
         uri.includes('youtu.be') ||
         sourceName.includes('youtube') ||
         sourceName.includes('yt');
}

function getTrackSource(track) {
  const uri = track.info.uri?.toLowerCase() || '';
  const sourceName = track.info.sourceName?.toLowerCase() || '';

  if (uri.includes('spotify.com') || sourceName.includes('spotify')) {
    return 'Spotify';
  } else if (uri.includes('youtube.com') || uri.includes('youtu.be') || sourceName.includes('youtube')) {
    return 'YouTube';
  } else if (uri.includes('soundcloud.com') || sourceName.includes('soundcloud')) {
    return 'SoundCloud';
  } else if (uri.includes('music.apple.com') || sourceName.includes('apple')) {
    return 'Apple Music';
  } else if (uri.includes('deezer.com') || sourceName.includes('deezer')) {
    return 'Deezer';
  } else if (uri.includes('jiosaavn.com') || sourceName.includes('jiosaavn') || sourceName.includes('saavn')) {
    return 'JioSaavn';
  } else if (sourceName) {
    return sourceName.charAt(0).toUpperCase() + sourceName.slice(1);
  } else {
    return 'Unknown';
  }
}

async function fetchRecommendations(track, client) {
  const artist = track.info.author || '';
  const title = track.info.title || '';

  if (!artist || !title) {
    throw new Error('Missing artist or track information for autoplay');
  }

  const params = new URLSearchParams({
    method: 'track.getsimilar',
    artist: artist,
    track: title,
    api_key: LASTFM_API_KEY,
    format: 'json',
    autocorrect: '1',
    limit: '10'
  });

  const url = `${LASTFM_BASE_URL}?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Last.fm API request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Last.fm API error: ${data.message}`);
  }

  const similarTracks = data.similartracks?.track;
  if (!similarTracks) {
    return [];
  }

  const tracks = Array.isArray(similarTracks) ? similarTracks : [similarTracks];
  const processedTracks = [];

  for (let i = 0; i < Math.min(tracks.length, 6); i++) {
    const track = tracks[i];
    const searchQuery = `${track.artist?.name || track.artist} ${track.name}`;

    let trackInfo = null;

    try {
      const searchResult = await client.music.search(searchQuery, {
        source: "spsearch"
      });

      if (searchResult?.tracks?.length > 0) {
        trackInfo = searchResult.tracks[0];
      }
    } catch (searchError) {
      logger.warn("QueueEnd", `Failed to search for autoplay track: ${searchQuery}`, searchError);
    }

    processedTracks.push({
      name: track.name,
      artist: track.artist?.name || track.artist,
      url: track.url,
      match: parseFloat(track.match) || 0,
      trackInfo: trackInfo,
      index: i
    });
  }

  return processedTracks;
}

function getPremiumStatus(guildId, userId) {
  if (!userId) return { hasPremium: false, maxSongs: config.queue.maxSongs.free };

  const premiumStatus = db.hasAnyPremium(userId, guildId);
  return {
    hasPremium: !!premiumStatus,
    type: premiumStatus ? premiumStatus.type : 'free',
    maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free
  };
}

function clearStoredMessageIds(player) {
  player.set('nowPlayingMessageId', null);
  player.set('nowPlayingChannelId', null);
  player.set('stuckWarningMessageId', null);
  player.set('errorMessageId', null);
  player.set('stuckTimeoutId', null);
}

function logSessionStats(player) {
  try {
    const sessionStats = {
      guildId: player.guildId,
      totalTracksPlayed: player.get('totalTracksPlayed') || 0,
      sessionDuration: Date.now() - (player.get('sessionStartTime') || Date.now()),
      endTime: new Date().toISOString(),
      autoplayEnabled: player.get('autoplayEnabled') || false
    };

    logger.info('QueueEnd', `Session completed in guild ${player.guildId}:`, sessionStats);
  } catch (statsError) {
    logger.debug('QueueEnd', 'Error logging session stats:', statsError);
  }
}