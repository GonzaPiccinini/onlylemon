import { Worker } from 'bullmq';

import { config } from '../config/env.js';
import { processInboundJob } from '../queues/inbound/processor.js';
import { logger } from '../lib/logger.js';
import { bullmqJobsTotal } from '../lib/metrics.js';

export const worker = new Worker(config.BULLMQ_QUEUE_NAME, processInboundJob, {
  connection: {
    url: config.BULLMQ_REDIS_URL,
  },
});

worker.on('error', (error) => {
  logger.error({ err: error }, 'BullMQ worker error');
});

worker.on('completed', (job) => {
  bullmqJobsTotal.labels('completed', job.name).inc();
});

worker.on('failed', (job, error) => {
  const eventType = job?.name ?? 'unknown';
  bullmqJobsTotal.labels('failed', eventType).inc();
  logger.error({ jobId: job?.id, eventType, err: error }, 'BullMQ job failed');
});

worker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'BullMQ job stalled');
});
