import { Worker, type WorkerOptions } from 'bullmq';

import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import { jobsFailedTotal } from '../core/metrics.js';
import { processInboundJob } from './processor.js';
import { setWorkerReady } from './state.js';

let worker: Worker | null = null;

export function createWorker() {
  const workerOptions: WorkerOptions = {
    connection: {
      url: config.bullmq.redisUrl,
    },
    concurrency: config.bullmq.concurrency,
  };

  worker = new Worker(config.bullmq.queueName, processInboundJob, workerOptions);

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, queue: config.bullmq.queueName }, 'Job completed');
  });

  worker.on('failed', (job, error) => {
    jobsFailedTotal.inc({ reason: 'worker_failed' });
    logger.error({ err: error, jobId: job?.id, queue: config.bullmq.queueName }, 'Job failed');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId, queue: config.bullmq.queueName }, 'Job stalled');
  });

  worker.on('error', (error) => {
    logger.error({ err: error, queue: config.bullmq.queueName }, 'Worker error');
  });

  setWorkerReady(true);

  return worker;
}

export function getWorker() {
  return worker;
}
