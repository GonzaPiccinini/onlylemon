import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import type { SessionsList } from '../waha/client.js';

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
// Shared test helpers
// ---------------------------------------------------------------------------

// Phase 2: landingId replaces metaPixelId in the public contract
const BASE_PAYLOAD = {
  fbc: 'fb.1.1234',
  fbp: 'fb.1.9876',
  userAgent: 'Mozilla/5.0',
  landingId: 'landing-uuid-http-1',
};

const MOCK_PIXEL = {
  id: 'meta-pixel-uuid-1',
  pixelId: '976916338006290',
  accessToken: 'mock-access-token',
  label: null as string | null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const MOCK_LANDING = {
  id: 'landing-uuid-http-1',
  url: 'https://example.com/lp1',
  metaPixelId: MOCK_PIXEL.id,
  status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
  whatsappMessages: [] as string[],
  metaPixel: { id: MOCK_PIXEL.id, pixelId: MOCK_PIXEL.pixelId, label: null as string | null },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function buildWorkingSession(name: string, number: string): SessionsList[number] {
  return {
    name,
    status: 'WORKING',
    config: { proxy: null, webhooks: [], debug: false },
    me: { id: `${number}@s.whatsapp.net`, pushname: name },
    engine: { engine: 'WEBJS' },
  };
}

/**
 * Builds a minimal CreateLeadDependencies object for integration tests.
 * Phase 2: includes `getLandingById` dep; saveLead returns snapshot fields.
 */
async function buildIntegrationDeps(
  selectCashierNumberForLanding: (landingId: string) => Promise<
    | { ok: true; number: string }
    | { ok: false; reason: 'LANDING_NOT_FOUND' | 'FALLBACK_INVARIANT_VIOLATION' }
  >,
  landingOverride?: typeof MOCK_LANDING | null,
) {
  return {
    selectCashierNumberForLanding,
    getLandingById: async (_id: string) =>
      landingOverride !== undefined
        ? landingOverride
        : MOCK_LANDING,
    getLeadByFbc: async () => null,
    saveLead: async ({ code }: {
      code: string; fbc: string; fbp: string; userAgent: string;
      landingId: string; metaPixelId: string; eventSourceUrl: string;
      adCode?: string;
    }) => ({
      id: 'lead-b9',
      code,
      fbc: BASE_PAYLOAD.fbc,
      fbp: BASE_PAYLOAD.fbp,
      userAgent: BASE_PAYLOAD.userAgent,
      metaPixelId: MOCK_PIXEL.id,
      metaPixel: MOCK_PIXEL,
      eventSourceUrl: MOCK_LANDING.url,
      landingId: BASE_PAYLOAD.landingId,
    }),
    dispatchLeadCreatedEvent: async () => {},
    generateCode: () => 'B9CODE01',
    getNow: () => new Date('2026-05-10T15:00:00.000Z'),
    onCodeCollision: () => {},
  };
}

// ---------------------------------------------------------------------------
// B9.1 — L1 hit: cashier on shift + WAHA WORKING → response uses cashier phone
// ---------------------------------------------------------------------------

test('POST /api/leads round-trip: L1 hit — on-shift cashier WAHA-WORKING → returns cashier phone and calls getSessions once', async () => {
  const { createLeadWithDependencies, selectCashierNumberForLandingWithDependencies } =
    await import('./service.js');

  let getSessionsCallCount = 0;

  const selectCashierNumberForLanding = (landingId: string) =>
    selectCashierNumberForLandingWithDependencies(landingId, {
      getActiveLandingCashierCandidatesByLandingId: async () => [
        {
          cashierId: 'cashier-1',
          sessionName: 'session-1',
          activeSince: new Date('2026-05-10T12:00:00.000Z'),
        },
      ],
      getAllLinkedCashierCandidatesByLandingId: async () => [
        { cashierId: 'cashier-1', sessionName: 'session-1' },
      ],
      getLandingFallbackPhonesByLandingId: async () => [
        { id: 'f1', phone: '+5490000000001' },
      ],
      getSessions: async () => {
        getSessionsCallCount += 1;
        return [buildWorkingSession('session-1', '5491111111111')];
      },
      getContactedLeadCountByCashierForLanding: async () =>
        new Map([['cashier-1', 0]]),
      getNow: () => new Date('2026-05-10T15:00:00.000Z'),
      getRandom: () => 0,
    });

  const deps = await buildIntegrationDeps(selectCashierNumberForLanding);
  const result = await createLeadWithDependencies(BASE_PAYLOAD, deps);

  assert.equal(result.code, 'B9CODE01');
  assert.equal(result.number, '5491111111111');
  assert.equal(getSessionsCallCount, 1, 'getSessions must be called exactly once');
});

// ---------------------------------------------------------------------------
// B9.2 — L2 hit: no cashier on shift, cashier WAHA-WORKING → returns cashier phone
// ---------------------------------------------------------------------------

test('POST /api/leads round-trip: L2 hit — no on-shift cashier, but ACTIVE cashier WAHA-WORKING → returns that cashier phone and calls getSessions once', async () => {
  const { createLeadWithDependencies, selectCashierNumberForLandingWithDependencies } =
    await import('./service.js');

  let getSessionsCallCount = 0;

  const selectCashierNumberForLanding = (landingId: string) =>
    selectCashierNumberForLandingWithDependencies(landingId, {
      getActiveLandingCashierCandidatesByLandingId: async () => [],
      getAllLinkedCashierCandidatesByLandingId: async () => [
        { cashierId: 'cashier-2', sessionName: 'session-2' },
      ],
      getLandingFallbackPhonesByLandingId: async () => [
        { id: 'f1', phone: '+5490000000001' },
      ],
      getSessions: async () => {
        getSessionsCallCount += 1;
        return [buildWorkingSession('session-2', '5492222222222')];
      },
      getContactedLeadCountByCashierForLanding: async () => new Map(),
      getNow: () => new Date('2026-05-10T15:00:00.000Z'),
      getRandom: () => 0,
    });

  const deps = await buildIntegrationDeps(selectCashierNumberForLanding);
  const result = await createLeadWithDependencies(BASE_PAYLOAD, deps);

  assert.equal(result.code, 'B9CODE01');
  assert.equal(result.number, '5492222222222');
  assert.equal(getSessionsCallCount, 1, 'getSessions must be called exactly once');
  assert.ok(result.number.length > 0, 'number must be non-empty');
});

// ---------------------------------------------------------------------------
// B9.3 — L3 hit: all cashiers offline → fallback phone from DB
// ---------------------------------------------------------------------------

test('POST /api/leads round-trip: L3 hit — all cashiers offline, fallback phones configured → returns E.164 fallback phone', async () => {
  const { createLeadWithDependencies, selectCashierNumberForLandingWithDependencies } =
    await import('./service.js');

  const fallbackPhones = [
    { id: 'f1', phone: '+5491111111111' },
    { id: 'f2', phone: '+5492222222222' },
    { id: 'f3', phone: '+5493333333333' },
  ];

  const selectCashierNumberForLanding = (landingId: string) =>
    selectCashierNumberForLandingWithDependencies(landingId, {
      getActiveLandingCashierCandidatesByLandingId: async () => [],
      getAllLinkedCashierCandidatesByLandingId: async () => [
        { cashierId: 'cashier-3', sessionName: 'session-3' },
      ],
      getLandingFallbackPhonesByLandingId: async () => fallbackPhones,
      getSessions: async () => [],
      getContactedLeadCountByCashierForLanding: async () => new Map(),
      getNow: () => new Date('2026-05-10T15:00:00.000Z'),
      getRandom: () => 0,
    });

  const deps = await buildIntegrationDeps(selectCashierNumberForLanding);
  const result = await createLeadWithDependencies(BASE_PAYLOAD, deps);

  assert.equal(result.code, 'B9CODE01');
  const fallbackPhoneValues = fallbackPhones.map((f) => f.phone);
  assert.ok(
    fallbackPhoneValues.includes(result.number),
    `number "${result.number}" should be one of ${fallbackPhoneValues.join(', ')}`,
  );
  assert.match(result.number, /^\+[1-9]\d{1,14}$/, 'number must be E.164');
});

// ---------------------------------------------------------------------------
// B9.4 — Invariant violation: 0 fallbacks + all offline → HTTP 500
// ---------------------------------------------------------------------------

test('POST /api/leads round-trip: invariant violation — 0 fallbacks + all offline → FallbackInvariantViolationError thrown; resolveCreateLeadHttpError maps to HTTP 500 with FALLBACK_INVARIANT_VIOLATION', async () => {
  const {
    createLeadWithDependencies,
    selectCashierNumberForLandingWithDependencies,
    FallbackInvariantViolationError,
  } = await import('./service.js');
  const { resolveCreateLeadHttpError } = await import('./http.js');

  const selectCashierNumberForLanding = (landingId: string) =>
    selectCashierNumberForLandingWithDependencies(landingId, {
      getActiveLandingCashierCandidatesByLandingId: async () => [],
      getAllLinkedCashierCandidatesByLandingId: async () => [],
      getLandingFallbackPhonesByLandingId: async () => [],
      getSessions: async () => [],
      getContactedLeadCountByCashierForLanding: async () => new Map(),
      getNow: () => new Date('2026-05-10T15:00:00.000Z'),
      getRandom: () => 0,
    });

  const deps = await buildIntegrationDeps(selectCashierNumberForLanding);

  let thrownError: unknown;
  await assert.rejects(
    () => createLeadWithDependencies(BASE_PAYLOAD, deps),
    (error: unknown) => {
      assert.ok(error instanceof FallbackInvariantViolationError);
      assert.equal(error.message, 'FALLBACK_INVARIANT_VIOLATION');
      thrownError = error;
      return true;
    },
  );

  const httpError = resolveCreateLeadHttpError(thrownError);
  assert.ok(httpError !== null, 'resolveCreateLeadHttpError must return a non-null response');
  assert.equal(httpError!.status, 500);
  assert.deepEqual(httpError!.body, { error: 'FALLBACK_INVARIANT_VIOLATION' });
});

// ---------------------------------------------------------------------------
// Phase 2 — HTTP contract for landing errors
// ---------------------------------------------------------------------------

test('resolveCreateLeadHttpError maps LANDING_NOT_FOUND to HTTP 404 with "Landing not found"', async () => {
  const { resolveCreateLeadHttpError } = await import('./http.js');

  const result = resolveCreateLeadHttpError(new Error('LANDING_NOT_FOUND'));

  assert.deepEqual(result, {
    status: 404,
    body: { message: 'Landing not found' },
  });
});

test('resolveCreateLeadHttpError maps LANDING_DISABLED to HTTP 404 with "Landing not found or disabled"', async () => {
  const { resolveCreateLeadHttpError } = await import('./http.js');

  const result = resolveCreateLeadHttpError(new Error('LANDING_DISABLED'));

  assert.deepEqual(result, {
    status: 404,
    body: { message: 'Landing not found or disabled' },
  });
});

test('resolveCreateLeadHttpError maps duplicate fbc errors to 409', async () => {
  const { resolveCreateLeadHttpError } = await import('./http.js');
  const { LeadFbcConflictError } = await import('./service.js');

  const result = resolveCreateLeadHttpError(new LeadFbcConflictError());

  assert.deepEqual(result, {
    status: 409,
    body: {
      message: 'Lead already exists for this fbc',
    },
  });
});

// ---------------------------------------------------------------------------
// extractAdCodeFromQueryParam
// ---------------------------------------------------------------------------

test('extractAdCodeFromQueryParam resolves utm_content values safely', async () => {
  const { extractAdCodeFromQueryParam } = await import('./http.js');

  assert.equal(extractAdCodeFromQueryParam('  ad-123  '), 'ad-123');
  assert.equal(
    extractAdCodeFromQueryParam(['', '  ', ' ad-xyz ']),
    'ad-xyz',
  );
  assert.equal(extractAdCodeFromQueryParam(undefined), undefined);
  assert.equal(extractAdCodeFromQueryParam('   '), undefined);
});

// ---------------------------------------------------------------------------
// Change B — Altcha captcha gate on POST /api/leads (HTTP contract)
// ---------------------------------------------------------------------------

type MockResponse = {
  statusCode: number;
  jsonBody: unknown;
  status(code: number): MockResponse;
  json(payload: unknown): MockResponse;
};

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    jsonBody: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.jsonBody = payload;
      return res;
    },
  };
  return res;
}

function createMockRequest(
  body: Record<string, unknown>,
  query: Record<string, unknown> = {},
): Request {
  return { body, query, ip: '127.0.0.1' } as unknown as Request;
}

test('POST /api/leads — missing altcha field → 400 "Captcha token required"', async () => {
  const { leadsPost } = await import('./http.js');

  const res = createMockResponse();
  // BASE_PAYLOAD intentionally has no `altcha` field.
  await leadsPost(createMockRequest({ ...BASE_PAYLOAD }), res as unknown as Response);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, { message: 'Captcha token required' });
});

test('POST /api/leads — invalid/expired/replayed captcha (verifyCaptcha false) → 403 "Captcha verification failed"', async () => {
  const { leadsPost } = await import('./http.js');

  const res = createMockResponse();
  // A malformed Altcha payload: the real verifyCaptcha rejects it at the HMAC
  // step (verifySolution throws → caught → false) WITHOUT touching Redis, so
  // this exercises the real 403 gate against production code.
  await leadsPost(
    createMockRequest({ ...BASE_PAYLOAD, altcha: 'not-a-valid-altcha-token' }),
    res as unknown as Response,
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.jsonBody, { message: 'Captcha verification failed' });
});

test('POST /api/leads — valid captcha + valid body → 201 with { code, number }', async () => {
  const { leadsPostWithDependencies } = await import('./http.js');

  let verifyCaptchaCalls = 0;
  let createLeadCalls = 0;

  const res = createMockResponse();
  await leadsPostWithDependencies(
    createMockRequest({ ...BASE_PAYLOAD, altcha: 'solved-altcha-payload' }),
    res as unknown as Response,
    {
      // Injected so the test never solves a real proof-of-work nor hits the DB.
      verifyCaptcha: async () => {
        verifyCaptchaCalls += 1;
        return true;
      },
      createLead: async () => {
        createLeadCalls += 1;
        return { code: 'TEST0001', number: '5491234567890' };
      },
    },
  );

  assert.equal(verifyCaptchaCalls, 1, 'captcha verified once');
  assert.equal(createLeadCalls, 1, 'createLead invoked once after captcha passes');
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.jsonBody, { code: 'TEST0001', number: '5491234567890' });
});
