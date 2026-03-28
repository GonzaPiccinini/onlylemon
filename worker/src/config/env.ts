import 'dotenv/config';
import { cleanEnv, num, str } from 'envalid';

const env = cleanEnv(process.env, {
  NODE_ENV: str({
    default: 'development',
    choices: ['development', 'test', 'production'],
  }),
  PORT: num({ default: 3000 }),
  LOG_LEVEL: str({ default: 'info' }),

  DATABASE_URL: str(),

  // AWS_REGION: str(),
  // AWS_S3_BUCKET: str(),
  // AWS_ACCESS_KEY_ID: str(),
  // AWS_SECRET_ACCESS_KEY: str(),

  AI_API_KEY: str(),
  AI_MODEL: str({ default: 'gemini-1.5-flash' }),

  CORS_ORIGIN: str({ default: 'http://localhost:3002' }),
  RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
  RATE_LIMIT_MAX: num({ default: 100 }),
});

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,

  databaseUrl: env.DATABASE_URL,

  // aws: {
  //   region: env.AWS_REGION,
  //   bucket: env.AWS_S3_BUCKET,
  //   accessKeyId: env.AWS_ACCESS_KEY_ID,
  //   secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  // },

  ai: {
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
  },

  corsOrigins: env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
} as const;
