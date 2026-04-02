import { Worker } from 'bullmq';

import { config } from './config.js';

export const worker = new Worker(
  config.QUEUE_NAME,
  async (job) => {
    console.log('received job', { id: job.id, name: job.name, data: job.data });
  },
  {
    connection: {
      url: config.REDIS_URL,
    },
  },
);

worker.on('error', (error) => {
  console.error('worker error', error);
});
