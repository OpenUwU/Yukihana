import { Yukihana } from '#structures/classes/Yukihana';
import { logger } from '#utils/logger';

const client = new Yukihana();

const main = async () => {
	try {
		await client.init();
		logger.success('Main', 'Discord bot initialized successfully');
	} catch (error) {
		logger.error('Main', 'Failed to initialize Discord bot', error);
		process.exit(1);
	}
};

const shutdown = async signal => {
	logger.info('Shutdown', `Received ${signal}, shutting down gracefully...`);
	try {
		await client.cleanup();
		logger.success('Shutdown', 'Bot shut down successfully');
		process.exit(0);
	} catch (error) {
		logger.error('Shutdown', 'Error during shutdown', error);
		process.exit(1);
	}
};

process.on('unhandledRejection', (reason, promise) => {
	logger.error('Process', 'Unhandled Rejection', reason);
	console.error(promise);
});

process.on('uncaughtException', (error, origin) => {
	logger.error('Process', `Uncaught Exception: ${origin}`, error);
	shutdown('uncaughtException');
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main();

export default client;
