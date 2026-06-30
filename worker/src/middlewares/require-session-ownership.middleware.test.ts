/**
 * require-session-ownership.middleware.test.ts
 *
 * Tests for the requireSessionOwnership middleware.
 * Written FIRST (RED) per strict TDD — implementation comes after.
 *
 * Session lookup is injected for testability (no real DB calls).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Env bootstrap (mirrors other test files in the project)
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
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

import { createRequireSessionOwnership } from './require-session-ownership.middleware.js';
import type { SessionOwnershipSession } from './require-session-ownership.middleware.js';

// ── helpers ───────────────────────────────────────────────────────────────────

type FakeReq = {
  params: { sessionId: string; cashierId?: string };
  authUser?: {
    role: 'CASHIER' | 'ADMIN' | 'SUPER_ADMIN';
    cashierId?: string;
    userId: string;
  };
  resolvedSession?: SessionOwnershipSession;
};

type FakeRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeRes;
  json: (data: unknown) => FakeRes;
};

function makeRes(): FakeRes {
  let _statusCode = 200;
  const res: FakeRes = {
    statusCode: 0,
    body: null,
    status(code) {
      _statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      res.statusCode = _statusCode;
      return res;
    },
  };
  return res;
}

function makeReq(overrides: Partial<FakeReq> = {}): FakeReq {
  return {
    params: { sessionId: 'session-uuid-1' },
    authUser: {
      role: 'CASHIER',
      cashierId: 'cashier-1',
      userId: 'user-1',
    },
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionOwnershipSession> = {}): SessionOwnershipSession {
  return {
    id: 'session-uuid-1',
    sessionName: 'cashier-abc-xyz',
    cashierId: 'cashier-1',
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('requireSessionOwnership — session not found', () => {
  it('returns 404 when session does not exist', async () => {
    const middleware = createRequireSessionOwnership({
      getWhatsappSession: async () => null,
    });

    const req = makeReq() as unknown as import('express').Request;
    const res = makeRes() as unknown as import('express').Response;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await middleware(req, res, next as import('express').NextFunction);

    assert.equal(nextCalled, false);
    assert.equal((res as unknown as FakeRes).statusCode, 404);
  });
});

describe('requireSessionOwnership — CASHIER owns session', () => {
  it('calls next() when CASHIER owns the session', async () => {
    const session = makeSession({ cashierId: 'cashier-1' });
    const middleware = createRequireSessionOwnership({
      getWhatsappSession: async () => session,
    });

    const req = makeReq({
      authUser: { role: 'CASHIER', cashierId: 'cashier-1', userId: 'user-1' },
    }) as unknown as import('express').Request;
    const res = makeRes() as unknown as import('express').Response;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await middleware(req, res, next as import('express').NextFunction);

    assert.equal(nextCalled, true);
    // resolved session attached to req
    assert.deepEqual(
      (req as unknown as FakeReq).resolvedSession,
      session,
    );
  });
});

describe('requireSessionOwnership — CASHIER does NOT own session', () => {
  it('returns 403 when CASHIER requests a foreign session', async () => {
    const session = makeSession({ cashierId: 'cashier-OTHER' });
    const middleware = createRequireSessionOwnership({
      getWhatsappSession: async () => session,
    });

    const req = makeReq({
      authUser: { role: 'CASHIER', cashierId: 'cashier-1', userId: 'user-1' },
    }) as unknown as import('express').Request;
    const res = makeRes() as unknown as import('express').Response;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await middleware(req, res, next as import('express').NextFunction);

    assert.equal(nextCalled, false);
    assert.equal((res as unknown as FakeRes).statusCode, 403);
  });
});

describe('requireSessionOwnership — ADMIN bypasses ownership', () => {
  it('calls next() for ADMIN regardless of session owner', async () => {
    const session = makeSession({ cashierId: 'cashier-OTHER' });
    const middleware = createRequireSessionOwnership({
      getWhatsappSession: async () => session,
    });

    const req = makeReq({
      authUser: { role: 'ADMIN', cashierId: undefined, userId: 'admin-user' },
    }) as unknown as import('express').Request;
    const res = makeRes() as unknown as import('express').Response;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await middleware(req, res, next as import('express').NextFunction);

    assert.equal(nextCalled, true);
    assert.deepEqual(
      (req as unknown as FakeReq).resolvedSession,
      session,
    );
  });
});

describe('requireSessionOwnership — path :cashierId consistency (admin routes)', () => {
  it('returns 404 when :cashierId in the path does not own the session (ADMIN)', async () => {
    const session = makeSession({ cashierId: 'cashier-1' });
    const middleware = createRequireSessionOwnership({
      getWhatsappSession: async () => session,
    });

    const req = makeReq({
      params: { sessionId: 'session-uuid-1', cashierId: 'cashier-OTHER' },
      authUser: { role: 'ADMIN', userId: 'admin-user' },
    }) as unknown as import('express').Request;
    const res = makeRes() as unknown as import('express').Response;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await middleware(req, res, next as import('express').NextFunction);

    assert.equal(nextCalled, false);
    assert.equal((res as unknown as FakeRes).statusCode, 404);
  });

  it('calls next() when :cashierId matches the session owner (ADMIN)', async () => {
    const session = makeSession({ cashierId: 'cashier-7' });
    const middleware = createRequireSessionOwnership({
      getWhatsappSession: async () => session,
    });

    const req = makeReq({
      params: { sessionId: 'session-uuid-1', cashierId: 'cashier-7' },
      authUser: { role: 'ADMIN', userId: 'admin-user' },
    }) as unknown as import('express').Request;
    const res = makeRes() as unknown as import('express').Response;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await middleware(req, res, next as import('express').NextFunction);

    assert.equal(nextCalled, true);
    assert.deepEqual((req as unknown as FakeReq).resolvedSession, session);
  });
});

describe('requireSessionOwnership — SUPER_ADMIN bypasses ownership', () => {
  it('calls next() for SUPER_ADMIN regardless of session owner', async () => {
    const session = makeSession({ cashierId: 'cashier-OTHER' });
    const middleware = createRequireSessionOwnership({
      getWhatsappSession: async () => session,
    });

    const req = makeReq({
      authUser: { role: 'SUPER_ADMIN', cashierId: undefined, userId: 'sa-user' },
    }) as unknown as import('express').Request;
    const res = makeRes() as unknown as import('express').Response;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await middleware(req, res, next as import('express').NextFunction);

    assert.equal(nextCalled, true);
    assert.deepEqual(
      (req as unknown as FakeReq).resolvedSession,
      session,
    );
  });
});
