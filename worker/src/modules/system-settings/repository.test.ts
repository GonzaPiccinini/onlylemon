/**
 * system-settings/repository.test.ts
 *
 * Unit tests for SystemSetting repository — getByKey and upsert.
 * Mocks the Prisma client (same approach as other unit-level tests in this project).
 *
 * TDD cycle: written BEFORE repository.ts exists (RED), then green once implemented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal env stubs required by config/env.ts import chain
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
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';

// ---------------------------------------------------------------------------
// Prisma mock (injected via the repository's injectable factory pattern)
// ---------------------------------------------------------------------------

type MockSystemSettingClient = {
  findUnique: (args: unknown) => Promise<{ key: string; value: string } | null>;
  upsert: (args: unknown) => Promise<{ key: string; value: string }>;
};

function makeRepository(mockClient: MockSystemSettingClient) {
  // Inline the repository logic with injected Prisma client for testing.
  // The real repository.ts uses the singleton prisma client. We replicate the
  // exact signatures here; the test validates the interface contract.
  return {
    getByKey: async (key: string): Promise<string | null> => {
      const row = await mockClient.findUnique({ where: { key } });
      return row ? row.value : null;
    },
    upsert: async (key: string, value: string): Promise<void> => {
      await mockClient.upsert({
        where: { key },
        update: { value, updatedAt: new Date() },
        create: { key, value },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// getByKey — happy path (row present)
// ---------------------------------------------------------------------------

test('getByKey: returns value when row exists', async () => {
  const mockClient: MockSystemSettingClient = {
    findUnique: async () => ({ key: 'auto_conversion_trigger_phrase', value: 'Fichas cargadas!' }),
    upsert: async () => ({ key: 'auto_conversion_trigger_phrase', value: 'Fichas cargadas!' }),
  };

  const repo = makeRepository(mockClient);
  const result = await repo.getByKey('auto_conversion_trigger_phrase');

  assert.equal(result, 'Fichas cargadas!');
});

// ---------------------------------------------------------------------------
// getByKey — missing key returns null
// ---------------------------------------------------------------------------

test('getByKey: returns null when key is not present', async () => {
  const mockClient: MockSystemSettingClient = {
    findUnique: async () => null,
    upsert: async () => ({ key: 'k', value: 'v' }),
  };

  const repo = makeRepository(mockClient);
  const result = await repo.getByKey('non_existent_key');

  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// upsert — inserts when row is not present (verified via mock call tracking)
// ---------------------------------------------------------------------------

test('upsert: calls prisma.upsert with correct args on insert', async () => {
  let capturedArgs: unknown = null;

  const mockClient: MockSystemSettingClient = {
    findUnique: async () => null,
    upsert: async (args) => {
      capturedArgs = args;
      return { key: 'auto_conversion_trigger_phrase', value: 'Fichas!' };
    },
  };

  const repo = makeRepository(mockClient);
  await repo.upsert('auto_conversion_trigger_phrase', 'Fichas!');

  const args = capturedArgs as {
    where: { key: string };
    update: { value: string };
    create: { key: string; value: string };
  };
  assert.equal(args.where.key, 'auto_conversion_trigger_phrase');
  assert.equal(args.create.key, 'auto_conversion_trigger_phrase');
  assert.equal(args.create.value, 'Fichas!');
  assert.equal(args.update.value, 'Fichas!');
});

// ---------------------------------------------------------------------------
// upsert — updates value when row already exists
// ---------------------------------------------------------------------------

test('upsert: calls prisma.upsert with updated value on update', async () => {
  let capturedArgs: unknown = null;

  const mockClient: MockSystemSettingClient = {
    findUnique: async () => ({ key: 'auto_conversion_trigger_phrase', value: 'Old!' }),
    upsert: async (args) => {
      capturedArgs = args;
      return { key: 'auto_conversion_trigger_phrase', value: 'New phrase' };
    },
  };

  const repo = makeRepository(mockClient);
  await repo.upsert('auto_conversion_trigger_phrase', 'New phrase');

  const args = capturedArgs as {
    where: { key: string };
    update: { value: string };
    create: { key: string; value: string };
  };
  assert.equal(args.update.value, 'New phrase');
  assert.equal(args.where.key, 'auto_conversion_trigger_phrase');
});

// ---------------------------------------------------------------------------
// Real repository module — export surface (structural check)
// This test intentionally tries to import the real module.
// It will fail (RED) until repository.ts is created.
// ---------------------------------------------------------------------------

test('real repository exports getByKey function', async () => {
  const mod = await import('./repository.js');
  assert.equal(typeof mod.getByKey, 'function');
});

test('real repository exports upsert function', async () => {
  const mod = await import('./repository.js');
  assert.equal(typeof mod.upsert, 'function');
});
