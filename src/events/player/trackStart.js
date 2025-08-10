import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { EventUtils } from '#utils/EventUtils';
import { db } from '#database/DatabaseManager';
import MusicCard from '#structures/classes/MusicCard';
import { logger } from '#utils/logger';

export default {
  name: "trackStart",
  once: false,
  async execute(player, track, payload, musicManager, client) {
    try {
      if (!track || !track.info) {
        logger.error('TrackStart', 'Invalid track data received:', track);
        return;
      }

      player.set('lastPlayedTrack', track);

      if (!player.get('sessionStartTime')) {
        player.set('sessionStartTime', Date.now());
        player.set('totalTracksPlayed', 0);
      }

      const currentCount = player.get('totalTracksPlayed') || 0;
      player.set('totalTracksPlayed', currentCount + 1);

      if (track.requester?.id && track.info.identifier) {
        try {
          logger.debug('TrackStart', `Adding to history: ${JSON.stringify({
            userId: track.requester.id,
            trackInfo: {
              identifier: track.info.identifier,
              title: track.info.title,
              author: track.info.author,
              uri: track.info.uri,
           },
          })}`);

          db.user.addTrackToHistory(track.requester.id, track.info);
        } catch (historyError) {
          logger.error('TrackStart', 'Error adding track to history:', historyError);
        }
      }

      let message;

      try {
        const musicCard = new MusicCard();
        const buffer = await musicCard.createMusicCard(track, 0);
        const attachment = new AttachmentBuilder(buffer, { name: 'yukihana-nowplaying.png' });
        const components = createControlComponents();

        message = await EventUtils.sendPlayerMessage(client, player, {
          files: [attachment],
          components,
        });
      } catch (cardError) {
        logger.error('TrackStart', 'Error creating music card:', cardError);

        const components = createControlComponents();
        message = await EventUtils.sendPlayerMessage(client, player, {
          content: `🎵 **Now Playing**\n**${track.info.title}** by **${track.info.author}**`,
          components,
        });
      }

      if (message?.id) {
        player.set('nowPlayingMessageId', message.id);
        player.set('nowPlayingChannelId', player.textChannelId);
      }

      logger.info('TrackStart', `Track started: "${track.info.title}" by ${track.info.author} in guild ${player.guildId} (Autoplay: ${player.get('autoplayEnabled') ? 'ON' : 'OFF'})`);
    } catch (error) {
      logger.error('TrackStart', 'Error in trackStart event:', error);

      const title = track?.info?.title || track?.title || 'Unknown Track';
      const author = track?.info?.author || track?.author || 'Unknown Artist';

      try {
        if (track) {
          player.set('lastPlayedTrack', track);
        }

        const message = await EventUtils.sendPlayerMessage(client, player, {
          content: `🎵 **Now Playing**\n**${title}** by **${author}**`,
          components: createControlComponents(),
        });

        if (message?.id) {
          player.set('nowPlayingMessageId', message.id);
          player.set('nowPlayingChannelId', player.textChannelId);
        }
      } catch (fallbackError) {
        logger.error('TrackStart', 'Even fallback message failed:', fallbackError);
      }
    }
  }
};

function createControlComponents() {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('music_controls_select')
    .setPlaceholder('Select an option...')
    .addOptions([
      {
        label: 'Shuffle Queue',
        description: 'Randomize the order of songs',
        value: 'shuffle',
      },
      {
        label: 'Loop: Off',
        description: 'No repeat',
        value: 'loop_off',
      },
      {
        label: 'Loop: Track',
        description: 'Repeat current song',
        value: 'loop_track',
      },
      {
        label: 'Loop: Queue',
        description: 'Repeat entire queue',
        value: 'loop_queue',
      },
      {
        label: 'Volume -20%',
        description: 'Decrease volume',
        value: 'volume_down',
      },
      {
        label: 'Volume +20%',
        description: 'Increase volume',
        value: 'volume_up',
      },
    ]);

  const controlButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('music_previous')
        .setLabel('Prev')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_pause')
        .setLabel('Pause')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger),
    );

  return [
    new ActionRowBuilder().addComponents(selectMenu),
    controlButtons,
  ];
}