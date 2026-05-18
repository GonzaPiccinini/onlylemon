/**
 * processor.test.ts
 *
 * Unit tests for the inbound BullMQ processor — Batch 8 (H1 RED).
 *
 * Strategy: test against `createInboundProcessor(deps)` factory with injectable
 * deps (same pattern as controller/service tests in this codebase). The default
 * `processInboundJob` export uses real deps; tests inject mocks.
 *
 * Covered scenarios:
 * H1.1 fromMe=true + trigger match → handleCashierTriggerMessage (not mapLeadsToPhone)
 * H1.2 fromMe=true + no trigger match → mapLeadsToPhone
 * H1.3 fromMe=false → mapLeadsToPhone (unchanged)
 * H1.4 trigger phrase unset (empty/whitespace) → no auto-conversion
 * H1.5 new schema fields (fromMe, hasMedia, media) accepted
 * H1.6 legacy payload without new fields still works
 * H1.7 both event=message and event=message.any reach the new branch
 * Defensive: handleCashierTriggerMessage errors swallowed (not propagated)
 * Idempotency: duplicate jobs still suppressed
 * session.status: unchanged path
 */

// ---------------------------------------------------------------------------
// Env stubs — MUST come before any project module imports
// ---------------------------------------------------------------------------
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-test-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://waha.local:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInboundProcessor, type InboundProcessorDeps } from './processor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JobLike = { id: string; name: string; data: unknown };

function makeJob(data: unknown, name = 'message'): JobLike {
  return { id: 'test-job-id', name, data };
}

// ---------------------------------------------------------------------------
// Default injectable deps — noop/pass-through baseline
// ---------------------------------------------------------------------------

function makeDefaultDeps(overrides: Partial<InboundProcessorDeps> = {}): InboundProcessorDeps {
  return {
    handleCashierTriggerMessage: async () => undefined,
    mapLeadsToPhone: async () => undefined,
    validateJobIdempotency: async () => true,
    processWhatsappSessionStatusService: async () => undefined,
    getSetting: async () => '',
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    metrics: {
      jobsTotal: { labels: () => ({ inc: () => undefined }) },
      jobDurationSeconds: { labels: () => ({ observe: () => undefined }) },
    },
    ...overrides,
  };
}

// ===========================================================================
// H1.5 + H1.6 — Schema acceptance
// ===========================================================================

describe('InboundMessageSchema — schema validation', () => {
  it('H1.5 — accepts payload with new optional fields (fromMe, hasMedia, media)', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      mapLeadsToPhone: async (...args) => {
        mapLeadsCalls.push(args);
      },
    });
    const processor = createInboundProcessor(deps);
    const job = makeJob({
      event: 'message.any',
      session: 'test-session',
      payload: {
        id: 'msg-1',
        from: '5491112345678@c.us',
        body: 'hello',
        fromMe: false,
        hasMedia: true,
        media: {
          url: 'https://waha.example.com/media/abc',
          mimetype: 'image/jpeg',
          s3: { Bucket: 'my-bucket', Key: 'media/abc.jpg' },
        },
      },
    });
    // fromMe=false → mapLeadsToPhone (schema must parse OK)
    await processor(job as never);
    assert.equal(mapLeadsCalls.length, 1);
  });

  it('H1.6 — accepts legacy payload WITHOUT new fields (backward compat)', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      mapLeadsToPhone: async (...args) => {
        mapLeadsCalls.push(args);
      },
    });
    const processor = createInboundProcessor(deps);
    const job = makeJob({
      event: 'message',
      session: 'legacy-session',
      payload: {
        id: 'msg-legacy',
        from: '5490011223344@c.us',
        body: 'old message',
        // no fromMe, no hasMedia, no media
      },
    });
    await processor(job as never);
    assert.equal(mapLeadsCalls.length, 1);
  });
});

// ===========================================================================
// H1.3 — fromMe=false → mapLeadsToPhone (unchanged)
// ===========================================================================

describe('fromMe=false — inbound messages always go to mapLeadsToPhone', () => {
  let mapLeadsCalls: unknown[][];
  let triggerCalls: unknown[][];
  let deps: InboundProcessorDeps;

  beforeEach(() => {
    mapLeadsCalls = [];
    triggerCalls = [];
    deps = makeDefaultDeps({
      getSetting: async () => 'convertir',
      mapLeadsToPhone: async (...args) => {
        mapLeadsCalls.push(args);
      },
      handleCashierTriggerMessage: async (...args) => {
        triggerCalls.push(args);
      },
    });
  });

  it('H1.3 — fromMe=false routes to mapLeadsToPhone, not handleCashierTriggerMessage', async () => {
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-1',
      payload: { id: 'msg-inbound', from: '549111@c.us', body: 'some text', fromMe: false },
    }) as never);
    assert.equal(mapLeadsCalls.length, 1);
    assert.equal(triggerCalls.length, 0);
  });

  it('H1.3b — fromMe=false with body matching trigger → still mapLeadsToPhone', async () => {
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-inbound',
      payload: { id: 'msg-inbound-2', from: '549222@c.us', body: 'convertir', fromMe: false },
    }) as never);
    assert.equal(triggerCalls.length, 0);
    assert.equal(mapLeadsCalls.length, 1);
  });
});

// ===========================================================================
// H1.4 — trigger phrase unset → no auto-conversion
// ===========================================================================

describe('trigger phrase unset → no auto-conversion', () => {
  it('H1.4 — empty getSetting: fromMe=true falls through to mapLeadsToPhone', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-cashier',
      payload: { id: 'msg-out-1', from: '549333@c.us', body: 'convertir', fromMe: true },
    }) as never);
    assert.equal(triggerCalls.length, 0);
    assert.equal(mapLeadsCalls.length, 1);
  });

  it('H1.4b — whitespace-only trigger phrase treated as unset', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '   ',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-cashier-2',
      payload: { id: 'msg-out-2', from: '549334@c.us', body: 'convertir', fromMe: true },
    }) as never);
    assert.equal(triggerCalls.length, 0);
    assert.equal(mapLeadsCalls.length, 1);
  });
});

// ===========================================================================
// H1.1 — fromMe=true + trigger phrase matches → handleCashierTriggerMessage
// ===========================================================================

describe('fromMe=true + trigger match → handleCashierTriggerMessage', () => {
  it('H1.1 — calls handleCashierTriggerMessage with correct payload; NOT mapLeadsToPhone', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: Array<[{ sessionName: string; chatId: string; messageId: string; body: string; fromMe: boolean }]> = [];
    const deps = makeDefaultDeps({
      getSetting: async () => 'convertir',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (payload) => {
        triggerCalls.push([payload as never]);
      },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-abc',
      payload: {
        id: 'msg-trigger-1',
        from: '5491112223333@c.us',
        body: 'convertir',
        fromMe: true,
      },
    }) as never);
    assert.equal(triggerCalls.length, 1);
    const [calledPayload] = triggerCalls[0];
    assert.equal(calledPayload.sessionName, 'sess-abc');
    assert.equal(calledPayload.chatId, '5491112223333@c.us');
    assert.equal(calledPayload.messageId, 'msg-trigger-1');
    assert.equal(calledPayload.body, 'convertir');
    assert.equal(calledPayload.fromMe, true);
    assert.equal(mapLeadsCalls.length, 0);
  });

  it('H1.1b — trigger phrase comparison is case-insensitive after trim', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '  Convertir  ',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-abc',
      payload: { id: 'msg-trigger-ci', from: '549444@c.us', body: 'CONVERTIR', fromMe: true },
    }) as never);
    assert.equal(triggerCalls.length, 1);
    assert.equal(mapLeadsCalls.length, 0);
  });

  it('H1.7a — event=message.any triggers handleCashierTriggerMessage', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => 'convertir',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-def',
      payload: { id: 'msg-any-1', from: '549555@c.us', body: 'convertir', fromMe: true },
    }) as never);
    assert.equal(triggerCalls.length, 1);
    assert.equal(mapLeadsCalls.length, 0);
  });

  it('H1.7b — event=message (original) also triggers handleCashierTriggerMessage', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => 'convertir',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-ghi',
      payload: { id: 'msg-orig-1', from: '549666@c.us', body: 'convertir', fromMe: true },
    }) as never);
    assert.equal(triggerCalls.length, 1);
    assert.equal(mapLeadsCalls.length, 0);
  });
});

// ===========================================================================
// H1.2 — fromMe=true + trigger does NOT match → mapLeadsToPhone
// ===========================================================================

describe('fromMe=true + trigger does NOT match → mapLeadsToPhone', () => {
  it('H1.2 — body does not match trigger → falls through to mapLeadsToPhone', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => 'convertir',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-jkl',
      payload: { id: 'msg-no-match', from: '549777@c.us', body: 'hola como estas', fromMe: true },
    }) as never);
    assert.equal(triggerCalls.length, 0);
    assert.equal(mapLeadsCalls.length, 1);
  });
});

// ===========================================================================
// Defensive: handleCashierTriggerMessage errors do not propagate
// ===========================================================================

describe('handleCashierTriggerMessage errors do not propagate out of processor', () => {
  it('if handleCashierTriggerMessage throws, processor swallows and succeeds', async () => {
    const deps = makeDefaultDeps({
      getSetting: async () => 'convertir',
      handleCashierTriggerMessage: async () => {
        throw new Error('unexpected crash in auto-conversion');
      },
    });
    const processor = createInboundProcessor(deps);
    await assert.doesNotReject(async () =>
      processor(makeJob({
        event: 'message',
        session: 'sess-err',
        payload: { id: 'msg-err', from: '549888@c.us', body: 'convertir', fromMe: true },
      }) as never),
    );
  });
});

// ===========================================================================
// session.status events — unchanged behavior
// ===========================================================================

describe('session.status events — unchanged behavior', () => {
  it('session.status routes to processWhatsappSessionStatusService', async () => {
    const statusCalls: unknown[][] = [];
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      processWhatsappSessionStatusService: async (...args) => { statusCalls.push(args); },
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob(
      {
        event: 'session.status',
        session: 'sess-status',
        payload: { status: 'WORKING', statuses: [{ status: 'WORKING', timestamp: 1234567890 }] },
      },
      'session.status',
    ) as never);
    assert.equal(statusCalls.length, 1);
    assert.equal(mapLeadsCalls.length, 0);
    assert.equal(triggerCalls.length, 0);
  });
});

// ===========================================================================
// Idempotency — duplicate suppression still works
// ===========================================================================

describe('idempotency — duplicate jobs are still suppressed', () => {
  it('validateJobIdempotency returns false → neither processing path runs', async () => {
    const mapLeadsCalls: unknown[][] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      validateJobIdempotency: async () => false,
      getSetting: async () => 'convertir',
      mapLeadsToPhone: async (...args) => { mapLeadsCalls.push(args); },
      handleCashierTriggerMessage: async (...args) => { triggerCalls.push(args); },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message',
      session: 'sess-dup',
      payload: { id: 'msg-dup', from: '549999@c.us', body: 'convertir', fromMe: true },
    }) as never);
    assert.equal(triggerCalls.length, 0);
    assert.equal(mapLeadsCalls.length, 0);
  });
});
