import dotenv from 'dotenv';
import { cleanEnv, num, str } from 'envalid';

dotenv.config();

const validatedEnv = cleanEnv(process.env, {
  PORT: num(),
  BULLMQ_REDIS_URL: str({ default: 'redis://localhost:6379' }),
  BULLMQ_QUEUE_NAME: str({ default: 'waha-messages' }),
  WEBHOOK_TOKEN: str(),
  MAX_PAYLOAD_BYTES: num({ default: 262144 }),
  QUEUE_MAX_BACKLOG: num({ default: 50000 }),
  QUEUE_DEGRADED_BACKLOG: num({ default: 20000 }),
  CORS_ALLOWED_ORIGINS: str({ default: '' }),
});

const parseCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const env = {
  port: validatedEnv.PORT,
  bullmqRedisUrl: validatedEnv.BULLMQ_REDIS_URL,
  bullmqQueueName: validatedEnv.BULLMQ_QUEUE_NAME,
  webhookToken: validatedEnv.WEBHOOK_TOKEN,
  maxPayloadBytes: validatedEnv.MAX_PAYLOAD_BYTES,
  queueMaxBacklog: validatedEnv.QUEUE_MAX_BACKLOG,
  queueDegradedBacklog: validatedEnv.QUEUE_DEGRADED_BACKLOG,
  corsAllowedOrigins: parseCsv(validatedEnv.CORS_ALLOWED_ORIGINS),
};
