import { PlayerManager } from '#managers/PlayerManager';
import { logger } from '#utils/logger';

export default {
	name: "interactionCreate",
	once: false,
	async execute(interaction, client) {
		try {
			if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
				return;
			}

			const musicControlIds = [
				'music_previous',
				'music_pause',
				'music_skip', 
				'music_stop',
				'music_controls_select'
			];

			if (!musicControlIds.includes(interaction.customId)) {
				return;
			}

			if (!interaction.member?.voice?.channel) {
				return interaction.reply({
					content: '❌ You must be in a voice channel to use music controls.',
					ephemeral: true
				});
			}

			const player = client.music?.getPlayer(interaction.guild.id);
			if (!player) {
				return interaction.reply({
					content: '❌ No music player found for this server.',
					ephemeral: true
				});
			}

			const pm = new PlayerManager(player);

			if (pm.voiceChannelId && interaction.member.voice.channelId !== pm.voiceChannelId) {
				return interaction.reply({
					content: '❌ You must be in the same voice channel as the bot to use controls.',
					ephemeral: true
				});
			}

			if (['music_pause', 'music_skip', 'music_previous'].includes(interaction.customId) && !pm.hasCurrentTrack) {
				return interaction.reply({
					content: '❌ No track is currently playing.',
					ephemeral: true
				});
			}

			await interaction.deferReply({ ephemeral: true });

			if (interaction.isButton()) {
				await handleButtonInteraction(interaction, pm);
			}

			if (interaction.isStringSelectMenu()) {
				await handleSelectMenuInteraction(interaction, pm);
			}

		} catch (error) {
			logger.error('InteractionCreate', 'Error handling music control interaction:', error);

			try {
				const errorMessage = '❌ An error occurred while processing your request.';
				if (interaction.deferred) {
					await interaction.editReply({ content: errorMessage });
				} else {
					await interaction.reply({ content: errorMessage, ephemeral: true });
				}
			} catch (replyError) {
				logger.error('InteractionCreate', 'Error sending error response:', replyError);
			}
		}
	},
};

async function handleButtonInteraction(interaction, pm) {
	const { customId } = interaction;
	let response = '';

	switch (customId) {
		case 'music_previous':
			const hasPrevious = await pm.playPrevious();
			if (hasPrevious) {
				response = '⏮️ Playing previous track.';
			} else {
				response = '❌ No previous track available.';
			}
			break;

		case 'music_pause':
			if (pm.isPaused) {
				await pm.resume();
				response = '▶️ Music resumed.';
			} else {
				await pm.pause();
				response = '⏸️ Music paused.';
			}
			break;

		case 'music_skip':
			const currentTrack = pm.currentTrack;
			const trackTitle = currentTrack?.info?.title || 'Unknown Track';
			await pm.skip();
			response = `⏭️ Skipped: ${trackTitle}`;
			break;

		case 'music_stop':
			await pm.stop(true, false);
			response = '⏹️ Music stopped and queue cleared.';
			break;

		default:
			response = '❌ Unknown action.';
			break;
	}

	await interaction.editReply({ content: response });
}

async function handleSelectMenuInteraction(interaction, pm) {
	const selectedValue = interaction.values[0];
	let response = '';

	switch (selectedValue) {
		case 'shuffle':
			const queueSize = pm.queueSize;
			if (queueSize === 0) {
				response = '❌ Queue is empty, nothing to shuffle.';
			} else {
				await pm.shuffleQueue();
				response = `🔀 Shuffled ${queueSize} tracks in the queue.`;
			}
			break;

		case 'loop_off':
			await pm.setRepeatMode('off');
			response = '🔁 Loop disabled.';
			break;

		case 'loop_track':
			await pm.setRepeatMode('track');
			response = '🔂 Looping current track.';
			break;

		case 'loop_queue':
			await pm.setRepeatMode('queue');
			response = '🔁 Looping entire queue.';
			break;

		case 'volume_down':
			const currentVolumeDown = pm.volume;
			const newVolumeDown = Math.max(0, currentVolumeDown - 20);
			await pm.setVolume(newVolumeDown);
			response = `🔉 Volume decreased to ${newVolumeDown}%`;
			break;

		case 'volume_up':
			const currentVolumeUp = pm.volume;
			const newVolumeUp = Math.min(100, currentVolumeUp + 20);
			await pm.setVolume(newVolumeUp);
			response = `🔊 Volume increased to ${newVolumeUp}%`;
			break;

		default:
			response = '❌ Unknown option selected.';
			break;
	}

	await interaction.editReply({ content: response });

	if (selectedValue.startsWith('loop_')) {
		await updateSelectMenuOptions(interaction, pm);
	}
}

async function updateSelectMenuOptions(interaction, pm) {
	try {
		const originalMessage = await interaction.fetchReply();
		if (!originalMessage?.components?.length) return;

		const actionRow = originalMessage.components.find(row => 
			row.components?.some(component => component.customId === 'music_controls_select')
		);

		if (!actionRow) return;

		const selectMenu = actionRow.components.find(component => 
			component.customId === 'music_controls_select'
		);

		if (!selectMenu) return;

		const currentMode = pm.repeatMode;
		const updatedOptions = selectMenu.options.map(option => {
			if (option.value === 'loop_off') {
				return {
					...option,
					label: currentMode === 'off' ? 'Loop: Off ✓' : 'Loop: Off',
					description: currentMode === 'off' ? 'Currently active' : 'No repeat'
				};
			} else if (option.value === 'loop_track') {
				return {
					...option,
					label: currentMode === 'track' ? 'Loop: Track ✓' : 'Loop: Track',
					description: currentMode === 'track' ? 'Currently active' : 'Repeat current song'
				};
			} else if (option.value === 'loop_queue') {
				return {
					...option,
					label: currentMode === 'queue' ? 'Loop: Queue ✓' : 'Loop: Queue',
					description: currentMode === 'queue' ? 'Currently active' : 'Repeat entire queue'
				};
			}
			return option;
		});

		selectMenu.options = updatedOptions;

		await originalMessage.edit({ components: originalMessage.components });

	} catch (error) {
		logger.error('InteractionCreate', 'Error updating select menu options:', error);
	}
}
