/**
 * embed.controller.test.ts — Phase 2 task 2.5
 *
 * Tests createEmbedController with a mocked repository:
 * - ACTIVE landing → 200, application/javascript, Cache-Control, ETag
 * - DISABLED landing → 404, no JS body
 * - Unknown landingId → 404, no JS body
 * - Invalid UUID format → 404
 * - ETag is stable for identical config
 * - ETag differs after config change (different pixelId)
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
process.env.WAHA_WEBHOOK_TOKEN_HEADER = process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRes() {
  let _statusCode = 200;
  const _headers: Record<string, string> = {};

  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: _headers,
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
      res.body = data !== undefined ? data : null;
      res.statusCode = _statusCode;
      return res;
    },
    set(key: string, value: string) {
      _headers[key.toLowerCase()] = value;
      return res;
    },
    setHeader(key: string, value: string) {
      _headers[key.toLowerCase()] = value;
      return res;
    },
    getHeader(key: string) {
      return _headers[key.toLowerCase()];
    },
  } as unknown as import('express').Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };

  return res;
}

function makeReq(params: Record<string, string> = {}) {
  return {
    params,
    query: {},
    body: {},
  } as unknown as import('express').Request;
}

// Valid UUID fixture
const VALID_LANDING_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const ACTIVE_LANDING = {
  id: VALID_LANDING_ID,
  status: 'ACTIVE' as const,
  whatsappMessages: ['Hola, quiero info'],
  metaPixelRelation: { pixelId: '976916338006290' },
};

const DISABLED_LANDING = {
  id: VALID_LANDING_ID,
  status: 'DISABLED' as const,
  whatsappMessages: ['Hola'],
  metaPixelRelation: { pixelId: '111111111111111' },
};

// ---------------------------------------------------------------------------
// 2.5 — ACTIVE landing → 200 with correct headers
// ---------------------------------------------------------------------------

test('ACTIVE landing → 200 response', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => ACTIVE_LANDING,
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  assert.equal(res.statusCode, 200, 'ACTIVE landing must return 200');
});

test('ACTIVE landing → Content-Type is application/javascript; charset=utf-8', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => ACTIVE_LANDING,
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  const ct = res.headers['content-type'] ?? '';
  assert.ok(
    ct.includes('application/javascript') && ct.includes('charset=utf-8'),
    `Content-Type must be "application/javascript; charset=utf-8", got: "${ct}"`,
  );
});

test('ACTIVE landing → Cache-Control header is set correctly', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => ACTIVE_LANDING,
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  const cc = res.headers['cache-control'] ?? '';
  assert.ok(cc.includes('public'), 'Cache-Control must include "public"');
  assert.ok(cc.includes('max-age=300'), 'Cache-Control must include "max-age=300"');
  assert.ok(cc.includes('stale-while-revalidate=600'), 'Cache-Control must include stale-while-revalidate=600');
});

test('ACTIVE landing → ETag header is present and quoted', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => ACTIVE_LANDING,
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  const etag = res.headers['etag'] ?? '';
  assert.ok(etag.startsWith('"') && etag.endsWith('"'), `ETag must be a quoted string, got: "${etag}"`);
});

test('ACTIVE landing → body is a non-empty JS string (the bundle)', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => ACTIVE_LANDING,
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  assert.ok(typeof res.body === 'string', 'body must be a string');
  assert.ok((res.body as string).length > 0, 'body must not be empty');
  assert.ok((res.body as string).includes('CTA_CONFIG'), 'body must include CTA_CONFIG');
});

// ---------------------------------------------------------------------------
// 2.5 — ETag stability and change detection
// ---------------------------------------------------------------------------

test('ETag is stable across two identical config calls', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => ACTIVE_LANDING,
  });

  const res1 = makeRes();
  const res2 = makeRes();
  await controller(makeReq({ landingId: VALID_LANDING_ID }), res1);
  await controller(makeReq({ landingId: VALID_LANDING_ID }), res2);

  assert.equal(res1.headers['etag'], res2.headers['etag'], 'same config must produce the same ETag');
});

test('ETag differs when pixelId changes', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  let callCount = 0;
  const controller = createEmbedController({
    getConfig: async (_id) => {
      callCount++;
      if (callCount === 1) return ACTIVE_LANDING;
      return { ...ACTIVE_LANDING, metaPixelRelation: { pixelId: '999999999999999' } };
    },
  });

  const res1 = makeRes();
  const res2 = makeRes();
  await controller(makeReq({ landingId: VALID_LANDING_ID }), res1);
  await controller(makeReq({ landingId: VALID_LANDING_ID }), res2);

  assert.notEqual(res1.headers['etag'], res2.headers['etag'], 'different pixelId must produce different ETags');
});

// ---------------------------------------------------------------------------
// 2.5 — DISABLED landing → 404
// ---------------------------------------------------------------------------

test('DISABLED landing → 404 with no JS body', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => DISABLED_LANDING,
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  assert.equal(res.statusCode, 404, 'DISABLED landing must return 404');
  const body = res.body;
  assert.ok(
    body === null || body === undefined || body === '' || body === false,
    'DISABLED 404 must not return a JS body',
  );
});

// ---------------------------------------------------------------------------
// 2.5 — Unknown landingId → 404
// ---------------------------------------------------------------------------

test('unknown landingId (null from repo) → 404', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => null,
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  assert.equal(res.statusCode, 404, 'unknown landing must return 404');
});

// ---------------------------------------------------------------------------
// 2.5 — Invalid UUID format → 404 (defensive validation)
// ---------------------------------------------------------------------------

test('invalid landingId format → 404', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const getConfigCalled: boolean[] = [];
  const controller = createEmbedController({
    getConfig: async (_id) => {
      getConfigCalled.push(true);
      return ACTIVE_LANDING;
    },
  });

  const req = makeReq({ landingId: 'not-a-valid-uuid' });
  const res = makeRes();
  await controller(req, res);

  assert.equal(res.statusCode, 404, 'invalid UUID format must return 404');
  assert.equal(getConfigCalled.length, 0, 'repository must NOT be called for invalid UUID');
});

// ---------------------------------------------------------------------------
// 2.5 — Landing with no metaPixelRelation → 404
// ---------------------------------------------------------------------------

test('ACTIVE landing with null metaPixelRelation → 404 (pixel not configured)', async () => {
  const { createEmbedController } = await import('./embed.controller.js');

  const controller = createEmbedController({
    getConfig: async (_id) => ({
      ...ACTIVE_LANDING,
      metaPixelRelation: null,
    }),
  });

  const req = makeReq({ landingId: VALID_LANDING_ID });
  const res = makeRes();
  await controller(req, res);

  assert.equal(res.statusCode, 404, 'landing without pixel must return 404 (not configured)');
});
