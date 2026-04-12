import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectBullMQ, disconnectBullMQ } from './config/bullmq.js';
import { logger } from './lib/logger.js';

const app = createApp();

const startServer = async (): Promise<void> => {
  try {
    await connectBullMQ();

    const server = app.listen(env.port, () => {
      logger.info({ port: env.port }, 'API listening');
    });

    const gracefulShutdown = async (): Promise<void> => {
      server.close(async () => {
        await disconnectBullMQ();
        process.exit(0);
      });
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

void startServer();
