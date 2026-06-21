/**
 * system-settings/conversion-config.test.ts
 *
 * Unit tests for makeLoadConversionConfig — verifies setting resolution,
 * defaults for unset/invalid values, and currency allowlist enforcement.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = process.env.PORT ?? '3002';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER = process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';

const settingsFrom =
  (store: Record<string, string>) =>
  async (key: string): Promise<string> =>
    store[key] ?? '';

test('all settings unset → full defaults (ARS + original thresholds)', async () => {
  const { makeLoadConversionConfig } = await import('./conversion-config.js');
  const load = makeLoadConversionConfig({ getSettingFn: settingsFrom({}) });

  assert.deepEqual(await load(), {
    currency: 'ARS',
    thresholds: { highValue: 10_000, tier1: 25_000, tier2: 50_000, tier3: 100_000 },
  });
});

test('valid currency + custom thresholds are honored', async () => {
  const { makeLoadConversionConfig } = await import('./conversion-config.js');
  const load = makeLoadConversionConfig({
    getSettingFn: settingsFrom({
      platform_currency: 'BRL',
      high_value_threshold: '50',
      high_value_tier1_threshold: '100',
      high_value_tier2_threshold: '250',
      high_value_tier3_threshold: '500',
    }),
  });

  assert.deepEqual(await load(), {
    currency: 'BRL',
    thresholds: { highValue: 50, tier1: 100, tier2: 250, tier3: 500 },
  });
});

test('unsupported currency falls back to ARS', async () => {
  const { makeLoadConversionConfig } = await import('./conversion-config.js');
  const load = makeLoadConversionConfig({
    getSettingFn: settingsFrom({ platform_currency: 'XYZ' }),
  });

  assert.equal((await load()).currency, 'ARS');
});

test('invalid / non-positive threshold values fall back to defaults', async () => {
  const { makeLoadConversionConfig } = await import('./conversion-config.js');
  const load = makeLoadConversionConfig({
    getSettingFn: settingsFrom({
      high_value_threshold: 'abc',
      high_value_tier1_threshold: '0',
      high_value_tier2_threshold: '-5',
      high_value_tier3_threshold: '',
    }),
  });

  assert.deepEqual((await load()).thresholds, {
    highValue: 10_000,
    tier1: 25_000,
    tier2: 50_000,
    tier3: 100_000,
  });
});
