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
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// Phase 2: payload uses landingId (replaces metaPixelId as routing key)
const payload = {
  fbc: 'fb.1.1234',
  fbp: 'fb.1.9876',
  userAgent: 'Mozilla/5.0',
  landingId: 'landing-uuid-1',
};

const payloadWithAdCode = {
  ...payload,
  adCode: 'ad-123',
};

// Minimal MetaPixel row shape for snapshot tests
const PIXEL_P1 = {
  id: 'meta-pixel-uuid-1',
  pixelId: '976916338006290',
  accessToken: 'P1-access-token-secret',
  label: null as string | null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// Minimal Landing shape with pixel relation
const LANDING_L1 = {
  id: 'landing-uuid-1',
  url: 'https://example.com/lp1',
  metaPixelRef: PIXEL_P1.id,
  status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
  metaAccessToken: 'legacy-token',
  metaPixelId: '976916338006290',
  whatsappMessages: [] as string[],
  metaPixelRelation: { id: PIXEL_P1.id, pixelId: PIXEL_P1.pixelId, label: null as string | null },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

type CreateLeadDependencies = {
  selectCashierNumberForLanding: (
    landingId: string,
  ) => Promise<
    | { ok: true; number: string }
    | { ok: false; reason: 'LANDING_NOT_FOUND' | 'FALLBACK_INVARIANT_VIOLATION' }
  >;
  getLandingById: (landingId: string) => Promise<typeof LANDING_L1 | null>;
  getLeadByFbc: (fbc: string) => Promise<{ id: string } | null>;
  saveLead: (data: {
    fbc: string;
    fbp: string;
    userAgent: string;
    landingId: string;
    metaPixelRef: string;
    eventSourceUrl: string;
    metaPixelId: string;
    adCode?: string;
    code: string;
  }) => Promise<{
    id: string;
    code: string;
    fbc: string;
    fbp: string;
    userAgent: string;
    metaPixelId: string;
    metaPixelRef: string | null;
    metaPixelRelation: typeof PIXEL_P1 | null;
    eventSourceUrl: string | null;
    landingId: string | null;
  }>;
  dispatchLeadCreatedEvent: (lead: {
    id: string;
    code: string;
    metaPixelId: string;
    metaPixelRef: string | null;
    metaPixelRelation: typeof PIXEL_P1 | null;
    eventSourceUrl: string | null;
    landingId: string | null;
    fbc: string;
    fbp: string;
    userAgent: string;
  }) => Promise<void>;
  generateCode: () => string;
  getNow: () => Date;
  onCodeCollision: () => void;
};

function buildSaveLeadResult(code: string, pixel = PIXEL_P1, url = LANDING_L1.url) {
  return {
    id: 'lead-1',
    code,
    fbc: payload.fbc,
    fbp: payload.fbp,
    userAgent: payload.userAgent,
    metaPixelId: pixel.pixelId,
    metaPixelRef: pixel.id,
    metaPixelRelation: pixel,
    eventSourceUrl: url,
    landingId: payload.landingId,
  };
}

function buildDependencies(
  overrides: Partial<CreateLeadDependencies> = {},
): CreateLeadDependencies {
  return {
    selectCashierNumberForLanding: async () => ({
      ok: true,
      number: '5491111111111',
    }),
    getLandingById: async () => LANDING_L1,
    getLeadByFbc: async () => null,
    saveLead: async ({ code }) => buildSaveLeadResult(code),
    dispatchLeadCreatedEvent: async () => {},
    generateCode: () => 'ABCD1234',
    getNow: () => new Date('2026-04-20T00:00:00.000Z'),
    onCodeCollision: () => {},
    ...overrides,
  };
}

function buildWorkingSessions(
  ...sessions: Array<{ name: string; number: string }>
): SessionsList {
  return sessions.map(({ name, number }) => ({
    name,
    status: 'WORKING',
    config: {
      proxy: null,
      webhooks: [],
      debug: false,
    },
    me: {
      id: `${number}@s.whatsapp.net`,
      pushname: name,
    },
    engine: {
      engine: 'WEBJS',
    },
  }));
}

// ---------------------------------------------------------------------------
// B10.4 — `number` non-empty on HTTP 200 across all 3 levels (REQ-MOD-2)
// Re-keyed: dependency keys now use ByLandingId
// ---------------------------------------------------------------------------

test('B10.4: L1 hit result number is non-empty string', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      { cashierId: 'cashier-1', sessionName: 'session-1', activeSince: new Date('2026-04-22T08:00:00.000Z') },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () => buildWorkingSessions({ name: 'session-1', number: '5491111111111' }),
    getContactedLeadCountByCashierForLanding: async () => new Map([['cashier-1', 0]]),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.ok(result.ok === true, 'should return ok: true');
  assert.ok(result.ok && result.number.length > 0, 'number must be non-empty on L1 hit');
});

test('B10.4: L2 hit result number is non-empty string', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [],
    getAllLinkedCashierCandidatesByLandingId: async () => [
      { cashierId: 'cashier-2', sessionName: 'session-2' },
    ],
    getLandingFallbackPhonesByLandingId: async () => [{ id: 'f1', phone: '+5490000000001' }],
    getSessions: async () => buildWorkingSessions({ name: 'session-2', number: '5492222222222' }),
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.ok(result.ok === true, 'should return ok: true');
  assert.ok(result.ok && result.number.length > 0, 'number must be non-empty on L2 hit');
});

test('B10.4: L3 hit result number is non-empty E.164 string', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [{ id: 'f1', phone: '+5491123456789' }],
    getSessions: async () => [],
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.ok(result.ok === true, 'should return ok: true');
  assert.ok(result.ok && result.number.length > 0, 'number must be non-empty on L3 hit');
  assert.match(result.ok ? result.number : '', /^\+[1-9]\d{1,14}$/, 'L3 number must be E.164');
});

// ---------------------------------------------------------------------------

test('createLeadWithDependencies rejects duplicate fbc before persisting', async () => {
  const { createLeadWithDependencies, LeadFbcConflictError } = await import(
    './service.js'
  );

  let saveCalls = 0;
  const deps = buildDependencies({
    getLeadByFbc: async () => ({ id: 'existing-lead' }),
    saveLead: async () => {
      saveCalls += 1;
      throw new Error('saveLead should not be called');
    },
  });

  await assert.rejects(
    () => createLeadWithDependencies(payload, deps),
    (error: unknown) => {
      assert.ok(error instanceof LeadFbcConflictError);
      assert.equal(error.message, 'LEAD_FBC_CONFLICT');
      return true;
    },
  );

  assert.equal(saveCalls, 0);
});

test('createLeadWithDependencies retries when unique collision happens on lead code', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  let attempt = 0;
  let collisions = 0;
  const deps = buildDependencies({
    generateCode: () => {
      attempt += 1;
      return attempt === 1 ? 'DUPL0001' : 'UNIQ0002';
    },
    saveLead: async ({ code }) => {
      if (code === 'DUPL0001') {
        throw Object.assign(new Error('code collision'), {
          code: 'P2002',
          meta: { target: ['code'] },
        });
      }
      return buildSaveLeadResult(code);
    },
    onCodeCollision: () => {
      collisions += 1;
    },
  });

  const result = await createLeadWithDependencies(payload, deps);

  assert.deepEqual(result, {
    code: 'UNIQ0002',
    number: '5491111111111',
  });
  assert.equal(collisions, 1);
});

// ---------------------------------------------------------------------------
// Phase 2 — Snapshot tests (Task 2.5)
// ---------------------------------------------------------------------------

test('2.5 snapshot: createLeadWithDependencies passes metaPixelRef + eventSourceUrl snapshot to saveLead', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  const capturedSaveLeadData: Record<string, unknown>[] = [];
  const deps = buildDependencies({
    saveLead: async (data) => {
      capturedSaveLeadData.push(data as unknown as Record<string, unknown>);
      return buildSaveLeadResult(data.code);
    },
  });

  await createLeadWithDependencies(payload, deps);

  assert.equal(capturedSaveLeadData.length, 1, 'saveLead called once');
  const saved = capturedSaveLeadData[0]!;
  assert.equal(saved['metaPixelRef'], PIXEL_P1.id, 'metaPixelRef = FK to MetaPixel.id');
  assert.equal(saved['eventSourceUrl'], LANDING_L1.url, 'eventSourceUrl = landing.url snapshot');
  assert.equal(saved['landingId'], payload.landingId, 'landingId persisted');
});

test('2.5 snapshot immunity: dispatchLeadCreatedEvent called with lead.metaPixelRelation (snapshot, not live landing)', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  const dispatchedLeads: Array<{ metaPixelRelation: unknown; eventSourceUrl: unknown }> = [];

  const deps = buildDependencies({
    dispatchLeadCreatedEvent: async (lead) => {
      dispatchedLeads.push({
        metaPixelRelation: lead.metaPixelRelation,
        eventSourceUrl: lead.eventSourceUrl,
      });
    },
  });

  await createLeadWithDependencies(payload, deps);

  assert.equal(dispatchedLeads.length, 1, 'dispatch called once');
  const dispatched = dispatchedLeads[0]!;
  // dispatch reads from lead.metaPixelRelation, NOT from live landing lookup
  const relation = dispatched.metaPixelRelation as typeof PIXEL_P1;
  assert.equal(relation.pixelId, PIXEL_P1.pixelId, 'dispatch uses snapshotted pixelId');
  assert.equal(relation.accessToken, PIXEL_P1.accessToken, 'dispatch uses snapshotted accessToken');
  assert.equal(dispatched.eventSourceUrl, LANDING_L1.url, 'dispatch uses snapshotted url');
});

test('2.5 accessToken not in any lead DTO or HTTP response', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  const result = await createLeadWithDependencies(payload, buildDependencies());

  // The HTTP response only returns code + number (no token leakage)
  assert.equal('code' in result, true);
  assert.equal('number' in result, true);
  assert.equal('accessToken' in result, false, 'accessToken must not be in HTTP response shape');
  assert.equal('metaPixelRelation' in result, false, 'metaPixelRelation must not be in HTTP response');
});

test('2.5 landing not found → LANDING_NOT_FOUND error', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  const deps = buildDependencies({
    getLandingById: async () => null,
  });

  await assert.rejects(
    () => createLeadWithDependencies(payload, deps),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error).message, 'LANDING_NOT_FOUND');
      return true;
    },
  );
});

test('2.5 landing DISABLED → LANDING_DISABLED error', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  const deps = buildDependencies({
    getLandingById: async () => ({ ...LANDING_L1, status: 'DISABLED' as const }),
  });

  await assert.rejects(
    () => createLeadWithDependencies(payload, deps),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error).message, 'LANDING_DISABLED');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// selectCashierNumberForLandingWithDependencies tests — re-keyed to landingId
// ---------------------------------------------------------------------------

test('selectCashierNumberForLandingWithDependencies returns L3 fallback phone when L1 and L2 yield no WAHA-WORKING candidates', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [
      { id: 'f1', phone: '+5491123456789' },
    ],
    getSessions: async () => [],
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, { ok: true, number: '+5491123456789' });
  assert.match(result.ok ? result.number : '', /^\+[1-9]\d{1,14}$/);
});

test('selectCashierNumberForLandingWithDependencies selects L2 cashier when L1 has no WAHA-WORKING candidates but L2 does', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      { cashierId: 'cashier-1', sessionName: 'session-1', activeSince: new Date('2026-04-22T08:00:00.000Z') },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [
      { cashierId: 'cashier-2', sessionName: 'session-2' },
    ],
    getLandingFallbackPhonesByLandingId: async () => [
      { id: 'f1', phone: '+5499999999999' },
    ],
    getSessions: async () =>
      buildWorkingSessions({ name: 'session-2', number: '5492222222222' }),
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, { ok: true, number: '5492222222222' });
});

test('selectCashierNumberForLandingWithDependencies falls through to L3 when L2 candidates exist but none are WAHA-WORKING', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [],
    getAllLinkedCashierCandidatesByLandingId: async () => [
      { cashierId: 'cashier-2', sessionName: 'session-2' },
    ],
    getLandingFallbackPhonesByLandingId: async () => [
      { id: 'f1', phone: '+5491111111111' },
      { id: 'f2', phone: '+5492222222222' },
      { id: 'f3', phone: '+5493333333333' },
    ],
    getSessions: async () => [],
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0.4,
  });

  assert.deepEqual(result, { ok: true, number: '+5492222222222' });
});

test('selectCashierNumberForLandingWithDependencies returns FALLBACK_INVARIANT_VIOLATION when L3 returns empty array', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () => [],
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, { ok: false, reason: 'FALLBACK_INVARIANT_VIOLATION' });
});

test('selectCashierNumberForLandingWithDependencies calls getSessions exactly once across L1→L2→L3 chain', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  let getSessionsCallCount = 0;

  await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [
      { id: 'f1', phone: '+5491123456789' },
    ],
    getSessions: async () => {
      getSessionsCallCount += 1;
      return [];
    },
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.equal(getSessionsCallCount, 1);
});

test('selectCashierNumberForLandingWithDependencies short-circuits with LANDING_NOT_FOUND when L1 returns null, without calling getSessions', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import('./service.js');

  let getSessionsCalled = false;
  let getAllLinkedCalled = false;
  let getFallbacksCalled = false;

  const result = await selectCashierNumberForLandingWithDependencies('landing-unknown', {
    getActiveLandingCashierCandidatesByLandingId: async () => null,
    getAllLinkedCashierCandidatesByLandingId: async () => { getAllLinkedCalled = true; return []; },
    getLandingFallbackPhonesByLandingId: async () => { getFallbacksCalled = true; return []; },
    getSessions: async () => { getSessionsCalled = true; return []; },
    getContactedLeadCountByCashierForLanding: async () => new Map(),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, { ok: false, reason: 'LANDING_NOT_FOUND' });
  assert.equal(getSessionsCalled, false);
  assert.equal(getAllLinkedCalled, false);
  assert.equal(getFallbacksCalled, false);
});

test('createLeadWithDependencies does not treat fbc save errors as duplicate-check conflicts', async () => {
  const { createLeadWithDependencies, LeadFbcConflictError } = await import(
    './service.js'
  );

  const persistenceError = Object.assign(new Error('fbc collision'), {
    code: 'P2002',
    meta: { target: ['fbc'] },
  });

  const deps = buildDependencies({
    saveLead: async () => {
      throw persistenceError;
    },
  });

  await assert.rejects(
    () => createLeadWithDependencies(payload, deps),
    (error: unknown) => {
      assert.equal(error, persistenceError);
      assert.equal(error instanceof LeadFbcConflictError, false);
      return true;
    },
  );
});

test('createLeadWithDependencies persists adCode when provided', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  let receivedAdCode: string | undefined;
  const deps = buildDependencies({
    saveLead: async ({ code, adCode }) => {
      receivedAdCode = adCode;
      return buildSaveLeadResult(code);
    },
  });

  const result = await createLeadWithDependencies(payloadWithAdCode, deps);

  assert.deepEqual(result, {
    code: 'ABCD1234',
    number: '5491111111111',
  });
  assert.equal(receivedAdCode, 'ad-123');
});

test('selectCashierNumberForLandingWithDependencies queries only the current Argentina day window', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import(
    './service.js'
  );

  let receivedSince: Date | null = null;
  let receivedUntil: Date | null = null;
  let receivedCashierIds: string[] = [];

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      {
        cashierId: 'cashier-1',
        sessionName: 'session-1',
        activeSince: new Date('2026-04-22T12:00:00.000Z'),
      },
      {
        cashierId: 'cashier-2',
        sessionName: 'session-2',
        activeSince: new Date('2026-04-22T12:00:00.000Z'),
      },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () =>
      buildWorkingSessions(
        { name: 'session-1', number: '5491111111111' },
        { name: 'session-2', number: '5492222222222' },
      ),
    getContactedLeadCountByCashierForLanding: async (_landingId, cashierIds, since, until) => {
      receivedCashierIds = cashierIds;
      receivedSince = since;
      receivedUntil = until;
      return new Map();
    },
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, {
    ok: true,
    number: '5491111111111',
  });
  assert.deepEqual(receivedCashierIds, ['cashier-1', 'cashier-2']);
  assert.ok(receivedSince);
  assert.ok(receivedUntil);
  assert.equal(
    (receivedSince as Date).toISOString(),
    '2026-04-22T03:00:00.000Z',
  );
  assert.equal(
    (receivedUntil as Date).toISOString(),
    '2026-04-23T03:00:00.000Z',
  );
});

test('selectCashierNumberForLandingWithDependencies excludes disconnected cashiers from daily balancing', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import(
    './service.js'
  );

  let receivedCashierIds: string[] = [];

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      {
        cashierId: 'cashier-1',
        sessionName: 'session-1',
        activeSince: new Date('2026-04-22T12:00:00.000Z'),
      },
      {
        cashierId: 'cashier-2',
        sessionName: 'session-2',
        activeSince: new Date('2026-04-22T12:00:00.000Z'),
      },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () =>
      buildWorkingSessions({ name: 'session-2', number: '5492222222222' }),
    getContactedLeadCountByCashierForLanding: async (_landingId, cashierIds) => {
      receivedCashierIds = cashierIds;
      return new Map([['cashier-2', 0]]);
    },
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(receivedCashierIds, ['cashier-2']);
  assert.deepEqual(result, {
    ok: true,
    number: '5492222222222',
  });
});

test('selectCashierNumberForLandingWithDependencies prioritizes the highest fair-share deficit', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import(
    './service.js'
  );

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      {
        cashierId: 'cashier-1',
        sessionName: 'session-1',
        activeSince: new Date('2026-04-22T08:00:00.000Z'),
      },
      {
        cashierId: 'cashier-2',
        sessionName: 'session-2',
        activeSince: new Date('2026-04-22T11:30:00.000Z'),
      },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () =>
      buildWorkingSessions(
        { name: 'session-1', number: '5491111111111' },
        { name: 'session-2', number: '5492222222222' },
      ),
    getContactedLeadCountByCashierForLanding: async () =>
      new Map([
        ['cashier-1', 8],
        ['cashier-2', 0],
      ]),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, {
    ok: true,
    number: '5492222222222',
  });
});

test('selectCashierNumberForLandingWithDependencies does not over-prioritize late cashier after reaching proportional share', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import(
    './service.js'
  );

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      {
        cashierId: 'cashier-1',
        sessionName: 'session-1',
        activeSince: new Date('2026-04-22T08:00:00.000Z'),
      },
      {
        cashierId: 'cashier-2',
        sessionName: 'session-2',
        activeSince: new Date('2026-04-22T11:30:00.000Z'),
      },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () =>
      buildWorkingSessions(
        { name: 'session-1', number: '5491111111111' },
        { name: 'session-2', number: '5492222222222' },
      ),
    getContactedLeadCountByCashierForLanding: async () =>
      new Map([
        ['cashier-1', 8],
        ['cashier-2', 4],
      ]),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, {
    ok: true,
    number: '5491111111111',
  });
});

test('selectCashierNumberForLandingWithDependencies distributes by active-time proportion for the day', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import(
    './service.js'
  );

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      {
        cashierId: 'cashier-1',
        sessionName: 'session-1',
        activeSince: new Date('2026-04-22T09:00:00.000Z'),
      },
      {
        cashierId: 'cashier-2',
        sessionName: 'session-2',
        activeSince: new Date('2026-04-22T12:00:00.000Z'),
      },
      {
        cashierId: 'cashier-3',
        sessionName: 'session-3',
        activeSince: new Date('2026-04-22T14:00:00.000Z'),
      },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () =>
      buildWorkingSessions(
        { name: 'session-1', number: '5491111111111' },
        { name: 'session-2', number: '5492222222222' },
        { name: 'session-3', number: '5493333333333' },
      ),
    getContactedLeadCountByCashierForLanding: async () =>
      new Map([
        ['cashier-1', 6],
        ['cashier-2', 3],
        ['cashier-3', 0],
      ]),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, {
    ok: true,
    number: '5493333333333',
  });
});

test('selectCashierNumberForLandingWithDependencies randomizes selection among top deficits', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import(
    './service.js'
  );

  const baseDependencies = {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      {
        cashierId: 'cashier-1',
        sessionName: 'session-1',
        activeSince: new Date('2026-04-22T12:00:00.000Z'),
      },
      {
        cashierId: 'cashier-2',
        sessionName: 'session-2',
        activeSince: new Date('2026-04-22T12:00:00.000Z'),
      },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () =>
      buildWorkingSessions(
        { name: 'session-1', number: '5491111111111' },
        { name: 'session-2', number: '5492222222222' },
      ),
    getContactedLeadCountByCashierForLanding: async () =>
      new Map([
        ['cashier-1', 0],
        ['cashier-2', 0],
      ]),
    getNow: () => new Date('2026-04-22T15:00:00.000Z'),
  };

  const first = await selectCashierNumberForLandingWithDependencies('landing-1', {
    ...baseDependencies,
    getRandom: () => 0,
  });
  const second = await selectCashierNumberForLandingWithDependencies('landing-1', {
    ...baseDependencies,
    getRandom: () => 0.99,
  });

  assert.deepEqual(first, {
    ok: true,
    number: '5491111111111',
  });
  assert.deepEqual(second, {
    ok: true,
    number: '5492222222222',
  });
});

test('selectCashierNumberForLandingWithDependencies clamps activity started before day boundary', async () => {
  const { selectCashierNumberForLandingWithDependencies } = await import(
    './service.js'
  );

  const result = await selectCashierNumberForLandingWithDependencies('landing-1', {
    getActiveLandingCashierCandidatesByLandingId: async () => [
      {
        cashierId: 'cashier-1',
        sessionName: 'session-1',
        activeSince: new Date('2026-04-21T20:00:00.000Z'),
      },
      {
        cashierId: 'cashier-2',
        sessionName: 'session-2',
        activeSince: new Date('2026-04-22T04:00:00.000Z'),
      },
    ],
    getAllLinkedCashierCandidatesByLandingId: async () => [],
    getLandingFallbackPhonesByLandingId: async () => [],
    getSessions: async () =>
      buildWorkingSessions(
        { name: 'session-1', number: '5491111111111' },
        { name: 'session-2', number: '5492222222222' },
      ),
    getContactedLeadCountByCashierForLanding: async () =>
      new Map([
        ['cashier-1', 3],
        ['cashier-2', 0],
      ]),
    getNow: () => new Date('2026-04-22T05:00:00.000Z'),
    getRandom: () => 0,
  });

  assert.deepEqual(result, {
    ok: true,
    number: '5492222222222',
  });
});

// ---------------------------------------------------------------------------
// CreateLeadPayloadSchema tests — Phase 2: landingId (replaces metaPixelId)
// ---------------------------------------------------------------------------

test('CreateLeadPayloadSchema accepts null fbc/fbp and normalizes them to empty string', async () => {
  const { CreateLeadPayloadSchema } = await import('./service.js');

  const parsed = CreateLeadPayloadSchema.safeParse({
    fbc: null,
    fbp: null,
    userAgent: 'Mozilla/5.0',
    landingId: 'landing-uuid-1',
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.fbc, '');
  assert.equal(parsed.success && parsed.data.fbp, '');
});

test('CreateLeadPayloadSchema accepts missing fbc/fbp', async () => {
  const { CreateLeadPayloadSchema } = await import('./service.js');

  const parsed = CreateLeadPayloadSchema.safeParse({
    userAgent: 'Mozilla/5.0',
    landingId: 'landing-uuid-1',
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.fbc, '');
  assert.equal(parsed.success && parsed.data.fbp, '');
});

test('CreateLeadPayloadSchema rejects missing landingId', async () => {
  const { CreateLeadPayloadSchema } = await import('./service.js');

  const parsed = CreateLeadPayloadSchema.safeParse({
    fbc: 'fb.1.1234',
    fbp: 'fb.1.9876',
    userAgent: 'Mozilla/5.0',
    // landingId absent
  });

  assert.equal(parsed.success, false);
});

test('CreateLeadPayloadSchema rejects empty landingId', async () => {
  const { CreateLeadPayloadSchema } = await import('./service.js');

  const parsed = CreateLeadPayloadSchema.safeParse({
    fbc: 'fb.1.1234',
    fbp: 'fb.1.9876',
    userAgent: 'Mozilla/5.0',
    landingId: '   ', // whitespace-only
  });

  assert.equal(parsed.success, false);
});

test('createLeadWithDependencies skips fbc dedup and creates the lead when fbc is empty', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  let getLeadByFbcCalled = false;
  const deps = buildDependencies({
    getLeadByFbc: async () => {
      getLeadByFbcCalled = true;
      return { id: 'existing-lead' };
    },
  });

  const result = await createLeadWithDependencies(
    { fbc: '', fbp: '', userAgent: 'Mozilla/5.0', landingId: 'landing-uuid-1' },
    deps,
  );

  assert.equal(result.code, 'ABCD1234');
  assert.equal(
    getLeadByFbcCalled,
    false,
    'must not run fbc dedup when fbc is empty',
  );
});
