import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL: z.string(),
  BULLMQ_REDIS_URL: z.string(),
  BULLMQ_QUEUE_NAME: z.string(),
  OPENAI_API_KEY: z.string(),
  OPENAI_MODEL: z.string(),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().default(10000),
  WAHA_API_KEY: z.string(),
  WAHA_BASE_URL: z.string(),
});

export const validateSchema = envSchema.safeParse(process.env);
if (validateSchema.error) {
  throw new Error(`Env vars error: ${validateSchema.error.message}`);
}

export const config = validateSchema.data;
