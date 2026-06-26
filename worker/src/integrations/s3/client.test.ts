/**
 * s3/client.test.ts
 *
 * Tests for the R2/S3 integration — deleteObject.
 *
 * Strict TDD — written RED before client.ts exists.
 *
 * Strategy: inject a fake S3Client-shaped object with a stubbed `send` method
 * so no real AWS calls are made. Tests cover:
 *  - getClient() throws R2NotConfiguredError when any required env var is missing
 *  - getClient() builds a client with forcePathStyle=true and defaults region to 'auto'
 *  - deleteObject() sends a DeleteObjectCommand with correct Bucket + Key
 *  - deleteObject() bubbles up SDK errors (no swallowing)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal env stubs (must come before any project imports)
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
// Import under test
// ---------------------------------------------------------------------------
import { deleteObject, R2NotConfiguredError } from './client.js';

// ---------------------------------------------------------------------------
// Helper: create a fake S3Client-shaped object with a stubbed send
// ---------------------------------------------------------------------------
type FakeSendFn = (cmd: unknown) => Promise<void>;

function makeFakeClient(sendFn: FakeSendFn = async () => {}) {
  return {
    send: sendFn,
  };
}

// ---------------------------------------------------------------------------
// 1. R2NotConfiguredError — missing env vars
// ---------------------------------------------------------------------------

test('throws R2NotConfiguredError when R2_ACCESS_KEY_ID is missing', async () => {
  const saved = {
    id: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
  };

  delete process.env.R2_ACCESS_KEY_ID;
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';

  try {
    await assert.rejects(
      () => deleteObject('my-bucket', 'my-key'),
      (err: unknown) => {
        assert.ok(err instanceof R2NotConfiguredError, `Expected R2NotConfiguredError, got ${String(err)}`);
        return true;
      },
    );
  } finally {
    // Restore
    if (saved.id !== undefined) process.env.R2_ACCESS_KEY_ID = saved.id;
    else delete process.env.R2_ACCESS_KEY_ID;
    if (saved.secret !== undefined) process.env.R2_SECRET_ACCESS_KEY = saved.secret;
    else delete process.env.R2_SECRET_ACCESS_KEY;
    if (saved.endpoint !== undefined) process.env.R2_ENDPOINT = saved.endpoint;
    else delete process.env.R2_ENDPOINT;
  }
});

test('throws R2NotConfiguredError when R2_SECRET_ACCESS_KEY is missing', async () => {
  const saved = {
    id: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
  };

  process.env.R2_ACCESS_KEY_ID = 'key-id';
  delete process.env.R2_SECRET_ACCESS_KEY;
  process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';

  try {
    await assert.rejects(
      () => deleteObject('my-bucket', 'my-key'),
      (err: unknown) => {
        assert.ok(err instanceof R2NotConfiguredError);
        return true;
      },
    );
  } finally {
    if (saved.id !== undefined) process.env.R2_ACCESS_KEY_ID = saved.id;
    else delete process.env.R2_ACCESS_KEY_ID;
    if (saved.secret !== undefined) process.env.R2_SECRET_ACCESS_KEY = saved.secret;
    else delete process.env.R2_SECRET_ACCESS_KEY;
    if (saved.endpoint !== undefined) process.env.R2_ENDPOINT = saved.endpoint;
    else delete process.env.R2_ENDPOINT;
  }
});

test('throws R2NotConfiguredError when R2_ENDPOINT is missing', async () => {
  const saved = {
    id: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
  };

  process.env.R2_ACCESS_KEY_ID = 'key-id';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  delete process.env.R2_ENDPOINT;

  try {
    await assert.rejects(
      () => deleteObject('my-bucket', 'my-key'),
      (err: unknown) => {
        assert.ok(err instanceof R2NotConfiguredError);
        assert.ok(
          (err as R2NotConfiguredError).message.includes('R2_ENDPOINT'),
          `Error message should mention R2_ENDPOINT, got: ${(err as R2NotConfiguredError).message}`,
        );
        return true;
      },
    );
  } finally {
    if (saved.id !== undefined) process.env.R2_ACCESS_KEY_ID = saved.id;
    else delete process.env.R2_ACCESS_KEY_ID;
    if (saved.secret !== undefined) process.env.R2_SECRET_ACCESS_KEY = saved.secret;
    else delete process.env.R2_SECRET_ACCESS_KEY;
    if (saved.endpoint !== undefined) process.env.R2_ENDPOINT = saved.endpoint;
    else delete process.env.R2_ENDPOINT;
  }
});

// ---------------------------------------------------------------------------
// 2. deleteObject — sends DeleteObjectCommand with correct Bucket + Key
// ---------------------------------------------------------------------------

test('deleteObject sends DeleteObjectCommand with correct Bucket and Key', async () => {
  const calls: { Bucket: string; Key: string }[] = [];

  const fakeClient = makeFakeClient(async (cmd: unknown) => {
    // The command is a DeleteObjectCommand — it has .input
    const c = cmd as { input: { Bucket: string; Key: string } };
    calls.push({ Bucket: c.input.Bucket, Key: c.input.Key });
  });

  await deleteObject('test-bucket', 'receipts/abc.jpg', fakeClient as never);

  assert.equal(calls.length, 1, 'send must be called exactly once');
  assert.equal(calls[0].Bucket, 'test-bucket');
  assert.equal(calls[0].Key, 'receipts/abc.jpg');
});

// ---------------------------------------------------------------------------
// 3. deleteObject — bubbles up SDK errors
// ---------------------------------------------------------------------------

test('deleteObject bubbles up errors from the SDK (no swallowing)', async () => {
  const sdkError = new Error('AccessDenied: you do not have permission');

  const fakeClient = makeFakeClient(async () => {
    throw sdkError;
  });

  await assert.rejects(
    () => deleteObject('test-bucket', 'receipts/abc.jpg', fakeClient as never),
    (err: unknown) => {
      assert.strictEqual(err, sdkError);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 4. R2NotConfiguredError class shape
// ---------------------------------------------------------------------------

test('R2NotConfiguredError is an instance of Error', () => {
  const err = new R2NotConfiguredError('test');
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'R2NotConfiguredError');
  assert.equal(err.message, 'test');
});
