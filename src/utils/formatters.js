import ms from 'ms';
import { logger } from '#utils/logger';
export function formatDuration(milliseconds) {
	if (!milliseconds || isNaN(milliseconds) || milliseconds < 0)
		return '00:00';

	const totalSeconds = Math.floor(milliseconds / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours.toString().padStart(2, '0')}:${minutes
			.toString()
			.padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}

	return `${minutes.toString().padStart(2, '0')}:${seconds
		.toString()
		.padStart(2, '0')}`;
}

export function createProgressBar(current, total, size = 15) {
	if (!current || !total || isNaN(current) || isNaN(total)) {
		return '▬'.repeat(size);
	}

	const percentage = Math.min(Math.max(current / total, 0), 1);
	const progress = Math.round(size * percentage);
	const emptyProgress = size - progress;

	const progressText = '▬'.repeat(progress);
	const emptyProgressText = '▬'.repeat(emptyProgress);
	const percentageText = Math.round(percentage * 100);

	return `${progressText}🔘${emptyProgressText} (${percentageText}%)`;
}

export function parseTimeString(time) {
	if (!time) return 0;

	try {
		return ms(time);
	} catch (error) {
		logger.error(`Error parsing time string:, ${error}`);
		return 0;
	}
}

export function formatNumber(number) {
	return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ', ');
}

export function truncate(string = '', length = 100) {
	if (!string) return '';

	if (string.length <= length) return string;

	return string.substring(0, length - 3) + '...';
}

export function formatList(array) {
	if (!array || !array.length) return '';

	if (array.length === 1) return array[0];

	if (array.length === 2) return `${array[0]} and ${array[1]}`;

	return array.slice(0, -1).join(', ') + ', and ' + array.slice(-1);
}

export function toTitleCase(string) {
	if (!string) return '';

	return string
		.toLowerCase()
		.split(' ')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
