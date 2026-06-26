import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER = process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

const stubSettings = (values: Record<string, string>) => async (key: string) =>
  values[key] ?? '';

test('getConversionAmountLimits: parses both min and max as positive integers', async () => {
  const { getConversionAmountLimits } = await import('./cashier.service.js');
  const limits = await getConversionAmountLimits(
    stubSettings({
      auto_conversion_min_amount: '3000',
      auto_conversion_max_amount: '50000',
    }),
  );
  assert.deepEqual(limits, { min: 3000, max: 50000 });
});

test('getConversionAmountLimits: missing values yield 0 (disabled)', async () => {
  const { getConversionAmountLimits } = await import('./cashier.service.js');
  const limits = await getConversionAmountLimits(stubSettings({}));
  assert.deepEqual(limits, { min: 0, max: 0 });
});

test('getConversionAmountLimits: "0" parses as disabled (0)', async () => {
  const { getConversionAmountLimits } = await import('./cashier.service.js');
  const limits = await getConversionAmountLimits(
    stubSettings({
      auto_conversion_min_amount: '0',
      auto_conversion_max_amount: '0',
    }),
  );
  assert.deepEqual(limits, { min: 0, max: 0 });
});

test('getConversionAmountLimits: garbage values fall back to 0', async () => {
  const { getConversionAmountLimits } = await import('./cashier.service.js');
  const limits = await getConversionAmountLimits(
    stubSettings({
      auto_conversion_min_amount: 'not-a-number',
      auto_conversion_max_amount: '-50',
    }),
  );
  assert.deepEqual(limits, { min: 0, max: 0 });
});

test('getConversionAmountLimits: only min set (max disabled)', async () => {
  const { getConversionAmountLimits } = await import('./cashier.service.js');
  const limits = await getConversionAmountLimits(
    stubSettings({ auto_conversion_min_amount: '1000' }),
  );
  assert.deepEqual(limits, { min: 1000, max: 0 });
});
