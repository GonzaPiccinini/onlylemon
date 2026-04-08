import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  LEADS_CODE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  DATABASE_URL: z.string(),
  BULLMQ_REDIS_URL: z.string(),
  BULLMQ_QUEUE_NAME: z.string(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  WAHA_API_KEY: z.string(),
  WAHA_BASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default('*'),
  META_PIXEL_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_API_VERSION: z.string().default('v21.0'),
});

export const validateSchema = envSchema.safeParse(process.env);
if (validateSchema.error) {
  throw new Error(`Env vars error: ${validateSchema.error.message}`);
}

export const config = validateSchema.data;

export const hasMetaConversionConfig =
  Boolean(config.META_PIXEL_ID) && Boolean(config.META_ACCESS_TOKEN);
