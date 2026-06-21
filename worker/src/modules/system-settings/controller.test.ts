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
// PUT — invalid: value > 2000 chars → 400 (multi-phrase support raised the cap)
// ---------------------------------------------------------------------------

test('PUT handler: value longer than 2000 chars → 400', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateAutoConversionTriggerHandler({
    upsertSettingFn: async () => {},
  });

  const req = makeReq({ body: { value: 'a'.repeat(2001) } });
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
    getSettingFn: async () => '0',
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
    getSettingFn: async () => '',
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
    getSettingFn: async () => '',
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

// ---------------------------------------------------------------------------
// Cross-validation: min cannot be greater than max (0 = disabled, skips check)
// ---------------------------------------------------------------------------

test('generic PUT min: rejects when new min > existing max (both > 0)', async () => {
  const mod = await import('./controller.js');

  let upserted = false;
  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {
      upserted = true;
    },
    getSettingFn: async (key: string) =>
      key === 'auto_conversion_max_amount' ? '5000' : '',
  });

  const req = makeReq({
    params: { key: 'auto_conversion_min_amount' },
    body: { value: '6000' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(upserted, false);
});

test('generic PUT max: rejects when new max < existing min (both > 0)', async () => {
  const mod = await import('./controller.js');

  let upserted = false;
  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {
      upserted = true;
    },
    getSettingFn: async (key: string) =>
      key === 'auto_conversion_min_amount' ? '5000' : '',
  });

  const req = makeReq({
    params: { key: 'auto_conversion_max_amount' },
    body: { value: '4000' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(upserted, false);
});

test('generic PUT min: allows when equal to existing max', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
    getSettingFn: async (key: string) =>
      key === 'auto_conversion_max_amount' ? '5000' : '',
  });

  const req = makeReq({
    params: { key: 'auto_conversion_min_amount' },
    body: { value: '5000' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

test('generic PUT min: allows when existing max is 0 (disabled)', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
    getSettingFn: async (key: string) =>
      key === 'auto_conversion_max_amount' ? '0' : '',
  });

  const req = makeReq({
    params: { key: 'auto_conversion_min_amount' },
    body: { value: '99999' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

test('generic PUT max: allows when existing min is 0 (disabled)', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
    getSettingFn: async (key: string) =>
      key === 'auto_conversion_min_amount' ? '0' : '',
  });

  const req = makeReq({
    params: { key: 'auto_conversion_max_amount' },
    body: { value: '100' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

test('generic PUT min: setting min to 0 always allowed (disables minimum)', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
    getSettingFn: async (key: string) =>
      key === 'auto_conversion_max_amount' ? '100' : '',
  });

  const req = makeReq({
    params: { key: 'auto_conversion_min_amount' },
    body: { value: '0' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

test('generic PUT: non-amount key skips cross-validation', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
    getSettingFn: async () => {
      throw new Error('should not be called for non-amount keys');
    },
  });

  const req = makeReq({
    params: { key: 'auto_conversion_trigger_phrase' },
    body: { value: 'hola' },
  });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
});

// ---------------------------------------------------------------------------
// Platform currency validation
// ---------------------------------------------------------------------------

test('generic PUT platform_currency: supported code → 200', async () => {
  const mod = await import('./controller.js');

  let saved = '';
  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async (_key: string, value: string) => {
      saved = value;
    },
    getSettingFn: async () => '',
  });

  const req = makeReq({ params: { key: 'platform_currency' }, body: { value: 'BRL' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: 'BRL' });
  assert.equal(saved, 'BRL');
});

test('generic PUT platform_currency: unsupported code → 400 and not saved', async () => {
  const mod = await import('./controller.js');

  let upserted = false;
  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {
      upserted = true;
    },
    getSettingFn: async () => '',
  });

  const req = makeReq({ params: { key: 'platform_currency' }, body: { value: 'XYZ' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(upserted, false);
});

// ---------------------------------------------------------------------------
// High-value threshold validation
// ---------------------------------------------------------------------------

test('generic PUT high_value_threshold: positive integer → 200', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
    getSettingFn: async () => '',
  });

  const req = makeReq({ params: { key: 'high_value_threshold' }, body: { value: '15000' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { value: '15000' });
});

test('generic PUT high_value_tier1_threshold: non-numeric → 400', async () => {
  const mod = await import('./controller.js');

  let upserted = false;
  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {
      upserted = true;
    },
    getSettingFn: async () => '',
  });

  const req = makeReq({ params: { key: 'high_value_tier1_threshold' }, body: { value: 'abc' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(upserted, false);
});

test('generic PUT high_value_tier2_threshold: zero → 400', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeUpdateSettingHandler({
    upsertSettingFn: async () => {},
    getSettingFn: async () => '',
  });

  const req = makeReq({ params: { key: 'high_value_tier2_threshold' }, body: { value: '0' } });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

// ---------------------------------------------------------------------------
// Currency options endpoint
// ---------------------------------------------------------------------------

test('getCurrencyOptionsHandler: returns supported currencies with code/label/symbol', async () => {
  const mod = await import('./controller.js');

  const req = makeReq();
  const res = makeRes();

  mod.getCurrencyOptionsHandler(req, res);

  assert.equal(res.statusCode, 200);
  const body = res.body as {
    currencies: Array<{ code: string; label: string; symbol: string }>;
  };
  assert.ok(Array.isArray(body.currencies));
  assert.ok(body.currencies.some((c) => c.code === 'ARS'));
  assert.ok(body.currencies.some((c) => c.code === 'BRL'));
  // Paraguay added
  const pyg = body.currencies.find((c) => c.code === 'PYG');
  assert.ok(pyg, 'PYG should be supported');
  assert.equal(pyg?.symbol, '₲');
});

// ---------------------------------------------------------------------------
// Active currency endpoint (any authenticated user)
// ---------------------------------------------------------------------------

test('getActiveCurrencyHandler: returns selected currency meta (PYG)', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeGetActiveCurrencyHandler({
    getSettingFn: async () => 'PYG',
  });

  const req = makeReq();
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    code: 'PYG',
    label: 'Guaraní paraguayo (PYG)',
    symbol: '₲',
  });
});

test('getActiveCurrencyHandler: unset setting falls back to ARS default', async () => {
  const mod = await import('./controller.js');

  const handler = mod.makeGetActiveCurrencyHandler({
    getSettingFn: async () => '',
  });

  const req = makeReq();
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const body = res.body as { code: string; symbol: string };
  assert.equal(body.code, 'ARS');
  assert.equal(body.symbol, '$');
});
