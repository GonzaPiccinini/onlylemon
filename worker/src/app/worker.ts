import { Worker } from 'bullmq';

import { config } from '../config/env.js';
import { processInboundJob } from '../queues/inbound/processor.js';

export const worker = new Worker(config.BULLMQ_QUEUE_NAME, processInboundJob, {
  connection: {
    url: config.BULLMQ_REDIS_URL,
  },
});

worker.on('error', (error) => {
  console.error('worker error', error);
});
