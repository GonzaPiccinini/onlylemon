import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number(),
  BULLMQ_REDIS_URL: z.string().min(1),
  BULLMQ_QUEUE_NAME: z.string().min(1),
  WEBHOOK_TOKEN_HEADER: z.string().min(1),
  WEBHOOK_TOKEN_VALUE: z.string().min(1),
  MAX_PAYLOAD_BYTES: z.coerce.number(),
  QUEUE_MAX_BACKLOG: z.coerce.number(),
  QUEUE_DEGRADED_BACKLOG: z.coerce.number(),
  CORS_ALLOWED_ORIGINS: z.string(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

const validatedEnv = envSchema.parse(process.env);

const parseCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const env = {
  port: validatedEnv.PORT,
  bullmqRedisUrl: validatedEnv.BULLMQ_REDIS_URL,
  bullmqQueueName: validatedEnv.BULLMQ_QUEUE_NAME,
  webhookTokenHeader: validatedEnv.WEBHOOK_TOKEN_HEADER,
  webhookTokenValue: validatedEnv.WEBHOOK_TOKEN_VALUE,
  maxPayloadBytes: validatedEnv.MAX_PAYLOAD_BYTES,
  queueMaxBacklog: validatedEnv.QUEUE_MAX_BACKLOG,
  queueDegradedBacklog: validatedEnv.QUEUE_DEGRADED_BACKLOG,
  corsAllowedOrigins: parseCsv(validatedEnv.CORS_ALLOWED_ORIGINS),
  logLevel: validatedEnv.LOG_LEVEL,
};
