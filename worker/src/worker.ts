import { Worker } from 'bullmq';

import { config } from './config.js';
import { processInboundJob } from './jobProcessor.js';

export const worker = new Worker(config.QUEUE_NAME, processInboundJob, {
  connection: {
    url: config.REDIS_URL,
  },
});

worker.on('error', (error) => {
  console.error('worker error', error);
});
