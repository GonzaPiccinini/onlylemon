import { createServer } from 'node:http';

import { config } from './core/config.js';
import { logger } from './core/logger.js';
import { prisma } from './core/prisma.js';
import { createApp } from './http/app.js';
import { createWorker, getWorker } from './worker/index.js';
import { setWorkerReady } from './worker/state.js';

const app = createApp();
const server = createServer(app);

async function start() {
  await prisma.$connect();

  createWorker();

  server.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        queue: config.bullmq.queueName,
        concurrency: config.bullmq.concurrency,
      },
      'Worker started',
    );
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  setWorkerReady(false);

  const worker = getWorker();
  if (worker) {
    await worker.close();
  }

  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start worker');
  process.exit(1);
});
