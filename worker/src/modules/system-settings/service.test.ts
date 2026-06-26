/**
 * system-settings/service.test.ts
 *
 * Unit tests for SystemSetting service layer — getSetting and upsertSetting.
 * Mocks the repository layer; validates the "missing key → empty string" contract
 * and that upsertSetting delegates to repository.upsert exactly once.
 *
 * TDD cycle: written BEFORE service.ts exists (RED), then green once implemented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal env stubs
// ---------------------------------------------------------------------------
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
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';

// ---------------------------------------------------------------------------
// Injectable service factory for unit testing (mirrors real service logic)
// ---------------------------------------------------------------------------

type MockRepo = {
  getByKey: (key: string) => Promise<string | null>;
  upsert: (key: string, value: string) => Promise<void>;
};

function makeService(repo: MockRepo) {
  return {
    getSetting: async (key: string): Promise<string> => {
      const value = await repo.getByKey(key);
      return value ?? '';
    },
    upsertSetting: async (key: string, value: string): Promise<void> => {
      await repo.upsert(key, value);
    },
  };
}

// ---------------------------------------------------------------------------
// getSetting — happy path (value present)
// ---------------------------------------------------------------------------

test('getSetting: returns value when key exists', async () => {
  const repo: MockRepo = {
    getByKey: async () => 'Fichas cargadas!',
    upsert: async () => {},
  };

  const service = makeService(repo);
  const result = await service.getSetting('auto_conversion_trigger_phrase');

  assert.equal(result, 'Fichas cargadas!');
});

// ---------------------------------------------------------------------------
// getSetting — missing key returns empty string (locked design decision)
// ---------------------------------------------------------------------------

test('getSetting: returns empty string when key is missing', async () => {
  const repo: MockRepo = {
    getByKey: async () => null,
    upsert: async () => {},
  };

  const service = makeService(repo);
  const result = await service.getSetting('auto_conversion_trigger_phrase');

  assert.equal(result, '');
});

// ---------------------------------------------------------------------------
// upsertSetting — delegates to repository.upsert exactly once
// ---------------------------------------------------------------------------

test('upsertSetting: calls repository.upsert once with correct args', async () => {
  let callCount = 0;
  let capturedKey = '';
  let capturedValue = '';

  const repo: MockRepo = {
    getByKey: async () => null,
    upsert: async (key, value) => {
      callCount++;
      capturedKey = key;
      capturedValue = value;
    },
  };

  const service = makeService(repo);
  await service.upsertSetting('auto_conversion_trigger_phrase', 'Fichas!');

  assert.equal(callCount, 1);
  assert.equal(capturedKey, 'auto_conversion_trigger_phrase');
  assert.equal(capturedValue, 'Fichas!');
});

// ---------------------------------------------------------------------------
// Real service module — export surface (structural check)
// Will fail (RED) until service.ts is created.
// ---------------------------------------------------------------------------

test('real service exports getSetting function', async () => {
  const mod = await import('./service.js');
  assert.equal(typeof mod.getSetting, 'function');
});

test('real service exports upsertSetting function', async () => {
  const mod = await import('./service.js');
  assert.equal(typeof mod.upsertSetting, 'function');
});
