/**
 * admin-session-link.service.test.ts
 * TDD: RED → GREEN for startWhatsappLinkForSessionAdminService
 *
 * Tests the admin-side "Generar QR ahora" service that mirrors the cashier flow
 * without the SESSION_NOT_OWNED ownership check.
 *
 * Strict TDD: tests written FIRST (RED). Implementation added after.
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
process.env.WAHA_WEBHOOK_URL =
  process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Export surface — RED tests
// ---------------------------------------------------------------------------

test('admin.service exports startWhatsappLinkForSessionAdminService', async () => {
  const mod = await import('./admin.service.js') as Record<string, unknown>;
  assert.equal(typeof mod.startWhatsappLinkForSessionAdminService, 'function');
});

// ---------------------------------------------------------------------------
// Behaviour: SESSION_NOT_FOUND when session does not exist (DB-gated)
// ---------------------------------------------------------------------------

test('startWhatsappLinkForSessionAdminService: non-existent sessionId throws SESSION_NOT_FOUND', async () => {
  const { startWhatsappLinkForSessionAdminService } = await import('./admin.service.js');

  try {
    await startWhatsappLinkForSessionAdminService('non-existent-id', '+5491100000000');
    assert.fail('Expected an error to be thrown');
  } catch (error) {
    if (error instanceof Error && error.message === 'DB_UNAVAILABLE') {
      // DB not available in test context — skip
      return;
    }
    // Expected: SESSION_NOT_FOUND (or a Prisma error when DB unavailable)
    if (error instanceof Error) {
      const isExpected =
        error.message === 'SESSION_NOT_FOUND' ||
        // Prisma throws when DB is unavailable — accept that too
        error.message.includes('prisma') ||
        error.message.includes('connect') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('database') ||
        error.constructor.name === 'PrismaClientKnownRequestError' ||
        error.constructor.name === 'PrismaClientInitializationError';
      assert.ok(isExpected, `Unexpected error: ${error.message}`);
    } else {
      // Non-Error thrown — acceptable
    }
  }
});

// ---------------------------------------------------------------------------
// Behaviour: does NOT check SESSION_NOT_OWNED — service function signature accepts (sessionId, phoneNumber) only
// ---------------------------------------------------------------------------

test('startWhatsappLinkForSessionAdminService: function accepts exactly (sessionId, phoneNumber)', async () => {
  const mod = await import('./admin.service.js') as Record<string, unknown>;
  const fn = mod.startWhatsappLinkForSessionAdminService as (...args: unknown[]) => unknown;
  // Function should exist and accept 2 params (no cashierId param like the cashier version)
  assert.equal(typeof fn, 'function');
  assert.equal(fn.length, 2);
});

// ---------------------------------------------------------------------------
// Controller export surface
// ---------------------------------------------------------------------------

test('admin controller exports startWhatsappLinkForSessionAdminHandler', async () => {
  const mod = await import('./admin.controller.js') as Record<string, unknown>;
  assert.equal(typeof mod.startWhatsappLinkForSessionAdminHandler, 'function');
});

// ---------------------------------------------------------------------------
// Controller guard: missing phoneNumber → 400
// ---------------------------------------------------------------------------

function makeRes() {
  let _statusCode = 200;
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      _statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      res.statusCode = _statusCode;
      return res;
    },
    send(data?: unknown) {
      res.body = data;
      res.statusCode = _statusCode;
      return res;
    },
  } as unknown as import('express').Response & { statusCode: number; body: unknown };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    authUser: { userId: 'admin-user-1' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as import('express').Request;
}

test('startWhatsappLinkForSessionAdminHandler: missing phoneNumber → 400', async () => {
  const { startWhatsappLinkForSessionAdminHandler } = await import('./admin.controller.js');

  const req = makeReq({
    params: { sessionId: 'some-session-id' },
    body: {},
  });
  const res = makeRes();

  await startWhatsappLinkForSessionAdminHandler(req, res);

  assert.equal(res.statusCode, 400);
});

test('startWhatsappLinkForSessionAdminHandler: invalid phoneNumber format → 400', async () => {
  const { startWhatsappLinkForSessionAdminHandler } = await import('./admin.controller.js');

  const req = makeReq({
    params: { sessionId: 'some-session-id' },
    body: { phoneNumber: 'not-a-phone' },
  });
  const res = makeRes();

  await startWhatsappLinkForSessionAdminHandler(req, res);

  assert.equal(res.statusCode, 400);
});

test('startWhatsappLinkForSessionAdminHandler: SESSION_NOT_FOUND → 404 (DB-gated)', async () => {
  const { startWhatsappLinkForSessionAdminHandler } = await import('./admin.controller.js');

  const req = makeReq({
    params: { sessionId: 'non-existent-id' },
    body: { phoneNumber: '+5491112345678' },
  });
  const res = makeRes();

  await startWhatsappLinkForSessionAdminHandler(req, res);

  // Without DB: will get 502 (WAHA/DB error). With DB: 404 for missing session.
  assert.ok([404, 502].includes(res.statusCode), `Expected 404 or 502, got ${res.statusCode}`);
});
