import 'dotenv/config';
import { cleanEnv, num, str } from 'envalid';

const env = cleanEnv(process.env, {
  NODE_ENV: str({
    default: 'development',
    choices: ['development', 'test', 'production'],
  }),
  PORT: num(),
  LOG_LEVEL: str(),

  WAHA_API_KEY: str(),
  WAHA_BASE_URL: str(),

  DATABASE_URL: str(),

  CHAT_CONTEXT_LIMIT: num({ default: 20 }),

  BULLMQ_QUEUE_NAME: str(),
  BULLMQ_REDIS_URL: str(),
  WORKER_CONCURRENCY: num(),

  EXTERNAL_API_BASE_URL: str(),
  EXTERNAL_API_KEY: str(),
  EXTERNAL_API_TIMEOUT_MS: num(),

  CORS_ORIGIN: str(),
});

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,

  wahaApiKey: env.WAHA_API_KEY,
  wahaBaseUrl: env.WAHA_BASE_URL,

  databaseUrl: env.DATABASE_URL,

  chatContextLimit: env.CHAT_CONTEXT_LIMIT,

  bullmq: {
    queueName: env.BULLMQ_QUEUE_NAME,
    redisUrl: env.BULLMQ_REDIS_URL,
    concurrency: env.WORKER_CONCURRENCY,
  },

  externalApi: {
    baseUrl: env.EXTERNAL_API_BASE_URL,
    apiKey: env.EXTERNAL_API_KEY || undefined,
    timeoutMs: env.EXTERNAL_API_TIMEOUT_MS,
  },

  corsOrigins: env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
