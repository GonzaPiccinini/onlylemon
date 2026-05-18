/**
 * system-settings/controller.test.ts
 *
 * Unit tests for SystemSetting controller handlers.
 * Tests the GET and PUT handlers in isolation via req/res mocks — same
 * approach used in admin.controller.test.ts.
 *
 * Auth (401) is enforced at the router middleware level (requireAuth guard)
 * and is NOT tested at the controller level, matching the pattern in
 * admin.controller.test.ts where 401 is also skipped at handler level.
 *
 * TDD cycle: written BEFORE controller.ts exists (RED), then green.
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
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';

// ---------------------------------------------------------------------------
// req / res mock helpers (mirrors admin.controller.test.ts pattern)
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
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as import('express').Request;
}

// ---------------------------------------------------------------------------
// Export surface
// ---------------------------------------------------------------------------

test('controller exports getAutoConversionTriggerHandler', async () => {
  const mod = await import('./controller.js');
  assert.equal(typeof mod.getAutoConversionTriggerHandler, 'function');
});

test('controller exports updateAutoConversionTriggerHandler', async () => {
  const mod = await import('./controller.js');
  assert.equal(typeof mod.updateAutoConversionTriggerHandler, 'function');
});

// ---------------------------------------------------------------------------
// GET /auto-conversion-trigger-phrase — happy path (value present)
// ---------------------------------------------------------------------------

test('GET handler: returns { value } with 200 when setting exists', async () => {
  // We need an injectable version of the handler to mock the service layer.
  // The controller.ts exports an injectable factory (makeGetHandler / makePutHandler)
  // AND the production-wired handlers. We use the injectable factory here.
  const mod = await import('./controller.js');

  // Use injectable factory: makeGetAutoConversionTriggerHandler
  const handler = mod.makeGetAutoConversionTriggerHandler({
    getSettingFn: async () => 'Fichas cargadas!',
  });

  const req = makeReq();
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: 'Fichas cargadas!' });
});

// ---------------------------------------------------------------------------
// GET — missing key returns { value: "" } with 200
// (service returns empty string for missing key — locked design decision)
// ---------------------------------------------------------------------------

test('GET handler: returns { value: "" } with 200 when key is missing', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeGetAutoConversionTriggerHandler({
    getSettingFn: async () => '',
  });

  const req = makeReq();
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: '' });
});

// ---------------------------------------------------------------------------
// PUT — happy path: valid body → 200 with { value }
// ---------------------------------------------------------------------------

test('PUT handler: valid body { value } → 200 with { value }', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateAutoConversionTriggerHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ body: { value: 'Fichas cargadas!' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: 'Fichas cargadas!' });
});

// ---------------------------------------------------------------------------
// PUT — invalid: empty string value → 400
// ---------------------------------------------------------------------------

test('PUT handler: empty value → 400', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateAutoConversionTriggerHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ body: { value: '' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

// ---------------------------------------------------------------------------
// PUT — invalid: value > 200 chars → 400
// ---------------------------------------------------------------------------

test('PUT handler: value longer than 200 chars → 400', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateAutoConversionTriggerHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ body: { value: 'a'.repeat(201) } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

// ---------------------------------------------------------------------------
// PUT — invalid: value field missing entirely → 400
// ---------------------------------------------------------------------------

test('PUT handler: missing value field → 400', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateAutoConversionTriggerHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

// ---------------------------------------------------------------------------
// PUT — valid boundary: exactly 1 char → 200
// ---------------------------------------------------------------------------

test('PUT handler: value of exactly 1 char → 200', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateAutoConversionTriggerHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ body: { value: 'X' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: 'X' });
});

// ---------------------------------------------------------------------------
// PUT — valid boundary: exactly 200 chars → 200
// ---------------------------------------------------------------------------

test('PUT handler: value of exactly 200 chars → 200', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateAutoConversionTriggerHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ body: { value: 'a'.repeat(200) } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

// ---------------------------------------------------------------------------
// Item #6 — Generic /:key handler tests
// ---------------------------------------------------------------------------

test('generic GET handler: valid key auto_conversion_trigger_phrase → 200', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeGetSettingHandler({
    getSettingFn: async (_key: string) => 'test-phrase',
  });

  const req = makeReq({ params: { key: 'auto_conversion_trigger_phrase' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: 'test-phrase' });
});

test('generic GET handler: valid key auto_conversion_min_amount → 200', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeGetSettingHandler({
    getSettingFn: async (_key: string) => '10000',
  });

  const req = makeReq({ params: { key: 'auto_conversion_min_amount' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: '10000' });
});

test('generic GET handler: invalid key → 404', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeGetSettingHandler({
    getSettingFn: async (_key: string) => '',
  });

  const req = makeReq({ params: { key: 'unknown_key_xyz' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
});

test('generic PUT handler: valid key and value → 200', async () => {
  const mod = await import('./controller.js');

  let savedKey = '';
  let savedValue = '';

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async (key: string, value: string) => {
      savedKey = key;
      savedValue = value;
    },
  });

  const req = makeReq({ params: { key: 'auto_conversion_min_amount' }, body: { value: '5000' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: '5000' });
  assert.equal(savedKey, 'auto_conversion_min_amount');
  assert.equal(savedValue, '5000');
});

test('generic PUT handler: invalid key → 404', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ params: { key: 'not_a_real_key' }, body: { value: 'some-value' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
});

test('generic PUT handler: missing value field → 400', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ params: { key: 'auto_conversion_min_amount' }, body: {} });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

test('controller exports makeGetSettingHandler', async () => {
  const mod = await import('./controller.js');
  assert.equal(typeof mod.makeGetSettingHandler, 'function');
});

test('controller exports makeUpdateSettingHandler', async () => {
  const mod = await import('./controller.js');
  assert.equal(typeof mod.makeUpdateSettingHandler, 'function');
});
