import 'dotenv/config';
import { z } from 'zod';

/**
 * Parses a duration string (e.g. "5m", "7d", "2h") into milliseconds.
 * Supports: Nm (minutes), Nh (hours), Nd (days).
 * Returns NaN for unrecognized formats.
 */
export const parseDurationToMs = (v: string): number => {
  const match = /^(\d+)(m|h|d)$/.exec(v.trim());
  if (!match) return NaN;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'm') return value * 60_000;
  if (unit === 'h') return value * 3_600_000;
  if (unit === 'd') return value * 24 * 3_600_000;
  return NaN;
};

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  LEADS_CODE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  DATABASE_URL: z.string(),
  BULLMQ_REDIS_URL: z.string(),
  BULLMQ_QUEUE_NAME: z.string(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  WAHA_API_KEY: z.string(),
  WAHA_BASE_URL: z.string(),
  WAHA_WEBHOOK_URL: z.string(),
  WAHA_WEBHOOK_EVENTS: z.string(),
  WAHA_WEBHOOK_TOKEN_HEADER: z.string(),
  WAHA_WEBHOOK_TOKEN_VALUE: z.string(),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z
    .string()
    .default('7d')
    .refine(
      (v) =>
        parseDurationToMs(v) >= 5 * 60_000 &&
        parseDurationToMs(v) <= 30 * 24 * 3_600_000,
      { message: 'JWT_ACCESS_EXPIRES must be between 5m and 30d' },
    ),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  CORS_ORIGIN: z.string().default('*'),
  META_API_VERSION: z.string().default('v21.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export const validateSchema = envSchema.safeParse(process.env);
if (validateSchema.error) {
  throw new Error(`Env vars error: ${validateSchema.error.message}`);
}

export const config = validateSchema.data;
