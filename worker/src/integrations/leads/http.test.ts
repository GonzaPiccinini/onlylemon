import { test } from 'node:test';
import assert from 'node:assert/strict';
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
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const BASE_PAYLOAD = {
  fbc: 'fb.1.1234',
  fbp: 'fb.1.9876',
  userAgent: 'Mozilla/5.0',
  metaPixelId: 'pixel-http-1',
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
 * Builds a minimal CreateLeadDependencies object for use with
 * createLeadWithDependencies. The `selectCashierNumberForLanding` function is
 * built from a full `selectCashierNumberForLandingWithDependencies` call with
 * the provided selectDeps, so the full L1→L2→L3 chain executes.
 */
async function buildIntegrationDeps(
  selectCashierNumberForLanding: (metaPixelId: string) => Promise<{ ok: true; number: string } | { ok: false; reason: 'LANDING_NOT_FOUND' | 'FALLBACK_INVARIANT_VIOLATION' }>,
) {
  return {
    selectCashierNumberForLanding,
    getLeadByFbc: async () => null,
    saveLead: async ({ code }: { code: string; fbc: string; fbp: string; userAgent: string; metaPixelId: string; adCode?: string }) => ({
      id: 'lead-b9',
      code,
      fbc: BASE_PAYLOAD.fbc,
      fbp: BASE_PAYLOAD.fbp,
      userAgent: BASE_PAYLOAD.userAgent,
      metaPixelId: BASE_PAYLOAD.metaPixelId,
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

// B9.1 (test) — L1 hit: cashier on shift + WAHA WORKING → POST /api/leads returns cashier phone
// REQ-1, REQ-2
test('POST /api/leads round-trip: L1 hit — on-shift cashier WAHA-WORKING → returns cashier phone and calls getSessions once', async () => {
  const { createLeadWithDependencies, selectCashierNumberForLandingWithDependencies } =
    await import('./service.js');

  let getSessionsCallCount = 0;

  const selectCashierNumberForLanding = (metaPixelId: string) =>
    selectCashierNumberForLandingWithDependencies(metaPixelId, {
      // L1: cashier-1 is on-shift
      getActiveLandingCashierCandidatesByMetaPixelId: async () => [
        {
          cashierId: 'cashier-1',
          sessionName: 'session-1',
          activeSince: new Date('2026-05-10T12:00:00.000Z'),
        },
      ],
      // L2: would also have cashier-1 (not reached)
      getAllLinkedCashierCandidatesByMetaPixelId: async () => [
        { cashierId: 'cashier-1', sessionName: 'session-1', whatsappPhoneNumber: null },
      ],
      // L3: not reached
      getLandingFallbackPhonesByMetaPixelId: async () => [
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

  // Response: HTTP 200-level fields
  assert.equal(result.code, 'B9CODE01');
  // number comes from the WAHA session number for cashier-1 (L1 deficit algo selects it)
  assert.equal(result.number, '5491111111111');
  // getSessions called exactly once (REQ-2)
  assert.equal(getSessionsCallCount, 1, 'getSessions must be called exactly once');
});

// ---------------------------------------------------------------------------
// B9.2 — L2 hit: no cashier on shift, cashier WAHA-WORKING → returns cashier phone
// ---------------------------------------------------------------------------

// B9.2 (test) — L2 hit: no active SessionActivity but ≥1 ACTIVE cashier WAHA-WORKING
// REQ-1, REQ-2
test('POST /api/leads round-trip: L2 hit — no on-shift cashier, but ACTIVE cashier WAHA-WORKING → returns that cashier phone and calls getSessions once', async () => {
  const { createLeadWithDependencies, selectCashierNumberForLandingWithDependencies } =
    await import('./service.js');

  let getSessionsCallCount = 0;

  const selectCashierNumberForLanding = (metaPixelId: string) =>
    selectCashierNumberForLandingWithDependencies(metaPixelId, {
      // L1: no on-shift cashiers
      getActiveLandingCashierCandidatesByMetaPixelId: async () => [],
      // L2: cashier-2 is ACTIVE + sessionName present
      getAllLinkedCashierCandidatesByMetaPixelId: async () => [
        { cashierId: 'cashier-2', sessionName: 'session-2', whatsappPhoneNumber: null },
      ],
      // L3: not reached
      getLandingFallbackPhonesByMetaPixelId: async () => [
        { id: 'f1', phone: '+5490000000001' },
      ],
      getSessions: async () => {
        getSessionsCallCount += 1;
        // session-2 is WORKING
        return [buildWorkingSession('session-2', '5492222222222')];
      },
      getContactedLeadCountByCashierForLanding: async () => new Map(),
      getNow: () => new Date('2026-05-10T15:00:00.000Z'),
      getRandom: () => 0,
    });

  const deps = await buildIntegrationDeps(selectCashierNumberForLanding);
  const result = await createLeadWithDependencies(BASE_PAYLOAD, deps);

  assert.equal(result.code, 'B9CODE01');
  // number comes from WAHA session for cashier-2 (L2 uniform-random pick)
  assert.equal(result.number, '5492222222222');
  // getSessions called exactly once (REQ-2)
  assert.equal(getSessionsCallCount, 1, 'getSessions must be called exactly once');
  // Confirm it is non-empty and E.164-like (WAHA phone without +, but non-empty)
  assert.ok(result.number.length > 0, 'number must be non-empty');
});

// ---------------------------------------------------------------------------
// B9.3 — L3 hit: all cashiers offline → fallback phone from DB
// ---------------------------------------------------------------------------

// B9.3 (test) — L3 hit: L1 and L2 yield nothing; ≥1 LandingFallbackPhone configured
// REQ-1
test('POST /api/leads round-trip: L3 hit — all cashiers offline, fallback phones configured → returns E.164 fallback phone', async () => {
  const { createLeadWithDependencies, selectCashierNumberForLandingWithDependencies } =
    await import('./service.js');

  const fallbackPhones = [
    { id: 'f1', phone: '+5491111111111' },
    { id: 'f2', phone: '+5492222222222' },
    { id: 'f3', phone: '+5493333333333' },
  ];

  const selectCashierNumberForLanding = (metaPixelId: string) =>
    selectCashierNumberForLandingWithDependencies(metaPixelId, {
      // L1: no on-shift cashiers
      getActiveLandingCashierCandidatesByMetaPixelId: async () => [],
      // L2: cashier exists but session is NOT WORKING → filtered out
      getAllLinkedCashierCandidatesByMetaPixelId: async () => [
        { cashierId: 'cashier-3', sessionName: 'session-3', whatsappPhoneNumber: null },
      ],
      // L3: 3 fallback phones
      getLandingFallbackPhonesByMetaPixelId: async () => fallbackPhones,
      // WAHA returns no WORKING sessions → L1 and L2 both come up empty
      getSessions: async () => [],
      getContactedLeadCountByCashierForLanding: async () => new Map(),
      getNow: () => new Date('2026-05-10T15:00:00.000Z'),
      // getRandom = 0 → picks index 0 → first fallback phone
      getRandom: () => 0,
    });

  const deps = await buildIntegrationDeps(selectCashierNumberForLanding);
  const result = await createLeadWithDependencies(BASE_PAYLOAD, deps);

  assert.equal(result.code, 'B9CODE01');
  // number must be one of the configured fallback phones
  const fallbackPhoneValues = fallbackPhones.map((f) => f.phone);
  assert.ok(
    fallbackPhoneValues.includes(result.number),
    `number "${result.number}" should be one of ${fallbackPhoneValues.join(', ')}`,
  );
  // number must match E.164 format
  assert.match(result.number, /^\+[1-9]\d{1,14}$/, 'number must be E.164');
});

// ---------------------------------------------------------------------------
// B9.4 — Invariant violation: 0 fallbacks + all offline → HTTP 500
// ---------------------------------------------------------------------------

// B9.4 (test) — no shift, no WAHA-WORKING cashiers, 0 fallback phones → FallbackInvariantViolationError → HTTP 500
// REQ-1
test('POST /api/leads round-trip: invariant violation — 0 fallbacks + all offline → FallbackInvariantViolationError thrown; resolveCreateLeadHttpError maps to HTTP 500 with FALLBACK_INVARIANT_VIOLATION', async () => {
  const {
    createLeadWithDependencies,
    selectCashierNumberForLandingWithDependencies,
    FallbackInvariantViolationError,
  } = await import('./service.js');
  const { resolveCreateLeadHttpError } = await import('./http.js');

  const selectCashierNumberForLanding = (metaPixelId: string) =>
    selectCashierNumberForLandingWithDependencies(metaPixelId, {
      // L1: no on-shift cashiers
      getActiveLandingCashierCandidatesByMetaPixelId: async () => [],
      // L2: no cashiers at all
      getAllLinkedCashierCandidatesByMetaPixelId: async () => [],
      // L3: 0 fallback phones → invariant violation
      getLandingFallbackPhonesByMetaPixelId: async () => [],
      getSessions: async () => [],
      getContactedLeadCountByCashierForLanding: async () => new Map(),
      getNow: () => new Date('2026-05-10T15:00:00.000Z'),
      getRandom: () => 0,
    });

  const deps = await buildIntegrationDeps(selectCashierNumberForLanding);

  // The service must throw FallbackInvariantViolationError
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

  // resolveCreateLeadHttpError must map it to HTTP 500
  const httpError = resolveCreateLeadHttpError(thrownError);
  assert.ok(httpError !== null, 'resolveCreateLeadHttpError must return a non-null response');
  assert.equal(httpError!.status, 500);
  assert.deepEqual(httpError!.body, { error: 'FALLBACK_INVARIANT_VIOLATION' });
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
