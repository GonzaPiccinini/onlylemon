import dotenv from 'dotenv';

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  port: toNumber(process.env.PORT, 3001),
  bullmqRedisUrl: process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379',
  bullmqQueueName: process.env.BULLMQ_QUEUE_NAME ?? 'waha-messages',
};
