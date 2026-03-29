import { Queue } from 'bullmq';
import { env } from './env.js';

let queue: Queue | null = null;

export type QueueStats = {
  waiting: number;
  delayed: number;
  active: number;
  failed: number;
  backlog: number;
};

const buildConnection = () => {
  const url = new URL(env.bullmqRedisUrl);
  const port = Number(url.port || '6379');

  return {
    host: url.hostname,
    port,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.replace('/', '') || '0'),
  };
};

export const getWebhookQueue = (): Queue => {
  if (!queue) {
    queue = new Queue(env.bullmqQueueName, {
      connection: buildConnection(),
    });

    queue.on('error', (error) => {
      console.error('BullMQ queue error:', error);
    });
  }

  return queue;
};

export const connectBullMQ = async (): Promise<void> => {
  const webhookQueue = getWebhookQueue();
  await webhookQueue.waitUntilReady();
  console.info('BullMQ connected');
};

export const disconnectBullMQ = async (): Promise<void> => {
  if (!queue) {
    return;
  }

  await queue.close();
  queue = null;
  console.info('BullMQ disconnected');
};

export const getWebhookQueueStats = async (): Promise<QueueStats> => {
  const webhookQueue = getWebhookQueue();
  const counts = await webhookQueue.getJobCounts(
    'waiting',
    'delayed',
    'active',
    'failed',
  );

  const waiting = counts.waiting ?? 0;
  const delayed = counts.delayed ?? 0;
  const active = counts.active ?? 0;
  const failed = counts.failed ?? 0;

  return {
    waiting,
    delayed,
    active,
    failed,
    backlog: waiting + delayed + active,
  };
};
