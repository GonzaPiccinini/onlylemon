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
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

const payload = {
  fbc: 'fb.1.1234',
  fbp: 'fb.1.9876',
  userAgent: 'Mozilla/5.0',
  metaPixelId: 'pixel-1',
};

const payloadWithAdCode = {
  ...payload,
  adCode: 'ad-123',
};

type CreateLeadDependencies = {
  selectCashierNumberForLanding: (
    metaPixelId: string,
  ) => Promise<
    | {
        ok: true;
        number: string;
      }
    | {
        ok: false;
        reason: 'LANDING_NOT_FOUND' | 'NO_AVAILABLE_CASHIER';
      }
  >;
  getLeadByFbc: (fbc: string) => Promise<{ id: string } | null>;
  saveLead: (data: {
    fbc: string;
    fbp: string;
    userAgent: string;
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
  }>;
  dispatchLeadCreatedEvent: (lead: {
    id: string;
    code: string;
    metaPixelId: string;
    fbc: string;
    fbp: string;
    userAgent: string;
  }) => Promise<void>;
  generateCode: () => string;
  getNow: () => Date;
  onCodeCollision: () => void;
};

function buildDependencies(
  overrides: Partial<CreateLeadDependencies> = {},
): CreateLeadDependencies {
  return {
    selectCashierNumberForLanding: async () => ({
      ok: true,
      number: '5491111111111',
    }),
    getLeadByFbc: async () => null,
    saveLead: async ({ code }) => ({
      id: 'lead-1',
      code,
      fbc: payload.fbc,
      fbp: payload.fbp,
      userAgent: payload.userAgent,
      metaPixelId: payload.metaPixelId,
    }),
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

      return {
        id: 'lead-created',
        code,
        fbc: payload.fbc,
        fbp: payload.fbp,
        userAgent: payload.userAgent,
        metaPixelId: payload.metaPixelId,
      };
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

test('createLeadWithDependencies creates the lead without cashier and returns empty number for landing fallback', async () => {
  const { createLeadWithDependencies } = await import('./service.js');

  let saveCalls = 0;
  const deps = buildDependencies({
    selectCashierNumberForLanding: async () => ({
      ok: false,
      reason: 'NO_AVAILABLE_CASHIER',
    }),
    saveLead: async ({ code }) => {
      saveCalls += 1;
      return {
        id: 'lead-fallback',
        code,
        fbc: payload.fbc,
        fbp: payload.fbp,
        userAgent: payload.userAgent,
        metaPixelId: payload.metaPixelId,
      };
    },
  });

  const result = await createLeadWithDependencies(payload, deps);

  assert.deepEqual(result, {
    code: 'ABCD1234',
    number: '',
  });
  assert.equal(saveCalls, 1);
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
      return {
        id: 'lead-adcode',
        code,
        fbc: payload.fbc,
        fbp: payload.fbp,
        userAgent: payload.userAgent,
        metaPixelId: payload.metaPixelId,
      };
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

  const result = await selectCashierNumberForLandingWithDependencies('pixel-1', {
    getActiveLandingCashierCandidatesByMetaPixelId: async () => [
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
    getSessions: async () =>
      buildWorkingSessions(
        { name: 'session-1', number: '5491111111111' },
        { name: 'session-2', number: '5492222222222' },
      ),
    getContactedLeadCountByCashierForLanding: async (_metaPixelId, cashierIds, since, until) => {
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

  const result = await selectCashierNumberForLandingWithDependencies('pixel-1', {
    getActiveLandingCashierCandidatesByMetaPixelId: async () => [
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
    getSessions: async () =>
      buildWorkingSessions({ name: 'session-2', number: '5492222222222' }),
    getContactedLeadCountByCashierForLanding: async (_metaPixelId, cashierIds) => {
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

  const result = await selectCashierNumberForLandingWithDependencies('pixel-1', {
    getActiveLandingCashierCandidatesByMetaPixelId: async () => [
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

  const result = await selectCashierNumberForLandingWithDependencies('pixel-1', {
    getActiveLandingCashierCandidatesByMetaPixelId: async () => [
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

  const result = await selectCashierNumberForLandingWithDependencies('pixel-1', {
    getActiveLandingCashierCandidatesByMetaPixelId: async () => [
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
    getActiveLandingCashierCandidatesByMetaPixelId: async () => [
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

  const first = await selectCashierNumberForLandingWithDependencies('pixel-1', {
    ...baseDependencies,
    getRandom: () => 0,
  });
  const second = await selectCashierNumberForLandingWithDependencies('pixel-1', {
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

  const result = await selectCashierNumberForLandingWithDependencies('pixel-1', {
    getActiveLandingCashierCandidatesByMetaPixelId: async () => [
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
