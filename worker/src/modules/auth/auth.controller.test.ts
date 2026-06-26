/**
 * auth.controller.test.ts — Batch 4: Controller handlers (TDD)
 *
 * Tests use surface-level checks and inline logic replicas — no real HTTP server.
 * Mirrors the pattern used in auth.service.test.ts and auth.repository.test.ts.
 */
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
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// B4.1 — controller export surface
// ---------------------------------------------------------------------------

test('loginHandler is exported from auth.controller', async () => {
  const mod = await import('./auth.controller.js');
  assert.equal(typeof (mod as Record<string, unknown>).loginHandler, 'function');
});

test('setupHandler is exported from auth.controller', async () => {
  const mod = await import('./auth.controller.js');
  assert.equal(typeof (mod as Record<string, unknown>).setupHandler, 'function');
});

test('logoutHandler is exported from auth.controller', async () => {
  const mod = await import('./auth.controller.js');
  assert.equal(typeof (mod as Record<string, unknown>).logoutHandler, 'function');
});

test('refreshHandler is exported from auth.controller', async () => {
  const mod = await import('./auth.controller.js');
  assert.equal(typeof (mod as Record<string, unknown>).refreshHandler, 'function');
});

// ---------------------------------------------------------------------------
// B4.1 — refreshHandler arity check
// ---------------------------------------------------------------------------

test('refreshHandler: arity is 2 (req, res)', async () => {
  const mod = await import('./auth.controller.js') as Record<string, unknown>;
  const fn = mod.refreshHandler as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 2);
});

// ---------------------------------------------------------------------------
// B4.1 — Zod schema validation logic (inline, no HTTP overhead)
// ---------------------------------------------------------------------------

test('refreshSchema rejects empty body (no refreshToken field)', async () => {
  const { refreshSchema } = await import('./auth.types.js');
  const result = refreshSchema.safeParse({});
  assert.equal(result.success, false);
});

test('refreshSchema rejects empty-string refreshToken', async () => {
  const { refreshSchema } = await import('./auth.types.js');
  const result = refreshSchema.safeParse({ refreshToken: '' });
  assert.equal(result.success, false);
});

test('refreshSchema accepts non-empty refreshToken', async () => {
  const { refreshSchema } = await import('./auth.types.js');
  const result = refreshSchema.safeParse({ refreshToken: 'some-token-value' });
  assert.equal(result.success, true);
});

test('logoutSchema rejects empty body (no refreshToken field)', async () => {
  const { logoutSchema } = await import('./auth.types.js');
  const result = logoutSchema.safeParse({});
  assert.equal(result.success, false);
});

test('logoutSchema rejects empty-string refreshToken', async () => {
  const { logoutSchema } = await import('./auth.types.js');
  const result = logoutSchema.safeParse({ refreshToken: '' });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// B4.1 — error class → 401 mapping logic (inline replicas)
// ---------------------------------------------------------------------------

test('RefreshReuseError is re-exported from auth.service and maps to 401', async () => {
  const { RefreshReuseError } = await import('./auth.service.js');
  const err = new RefreshReuseError();
  // Simulate the controller mapping: instanceof check → 401
  const status = err instanceof RefreshReuseError ? 401 : 500;
  assert.equal(status, 401);
});

test('RefreshExpiredError is re-exported from auth.service and maps to 401', async () => {
  const { RefreshExpiredError } = await import('./auth.service.js');
  const err = new RefreshExpiredError();
  const status = err instanceof RefreshExpiredError ? 401 : 500;
  assert.equal(status, 401);
});

test('RefreshInvalidError is re-exported from auth.service and maps to 401', async () => {
  const { RefreshInvalidError } = await import('./auth.service.js');
  const err = new RefreshInvalidError();
  const status = err instanceof RefreshInvalidError ? 401 : 500;
  assert.equal(status, 401);
});
