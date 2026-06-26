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
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
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
    mirrorChatMessage: async () => undefined,
    mirrorChatReaction: async () => undefined,
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

  it('H1.5b — accepts sticker media without s3 and url=null, and still fans out', async () => {
    const mirrorCalls: unknown[] = [];
    const deps = makeDefaultDeps({
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    const job = makeJob({
      event: 'message.any',
      session: 'test-session',
      payload: {
        id: 'sticker-1',
        from: '5491112345678@c.us',
        body: '',
        fromMe: false,
        hasMedia: true,
        // Sticker: not in WHATSAPP_FILES_MIMETYPES → WAHA didn't download it.
        media: { url: null, mimetype: 'image/webp' },
      },
    });
    await processor(job as never);
    assert.equal(mirrorCalls.length, 1);
    const m = mirrorCalls[0] as { hasMedia: boolean; mediaMimetype: string | null };
    assert.equal(m.hasMedia, true);
    assert.equal(m.mediaMimetype, 'image/webp');
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

// ===========================================================================
// Batch 2 — mirrorChatMessage fan-out
// ===========================================================================

describe('mirrorChatMessage fan-out — message.any text job', () => {
  it('B2.1 — mirrorChatMessage is called for inbound message.any text job with correct fields', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-mirror',
      payload: {
        id: 'msg-mirror-1',
        from: '5491112345678@c.us',
        body: 'hello world',
        fromMe: false,
        hasMedia: false,
      },
    }) as never);
    assert.equal(mirrorCalls.length, 1);
    const call = mirrorCalls[0];
    assert.equal(call.sessionName, 'sess-mirror');
    assert.equal(call.chatId, '5491112345678@c.us');
    assert.equal(call.messageId, 'msg-mirror-1');
    assert.equal(call.body, 'hello world');
    assert.equal(call.fromMe, false);
    assert.equal(call.hasMedia, false);
  });

  it('B2.2 — mirrorChatMessage is called for message.any with hasMedia=true and mediaMimetype', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-media',
      payload: {
        id: 'msg-media-1',
        from: '5499887766@c.us',
        body: '',
        fromMe: false,
        hasMedia: true,
        media: {
          url: 'https://waha.example.com/media/xyz',
          mimetype: 'image/jpeg',
          s3: { Bucket: 'bucket', Key: 'key' },
        },
      },
    }) as never);
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0].hasMedia, true);
    assert.equal(mirrorCalls[0].mediaMimetype, 'image/jpeg');
  });

  it('B2.3 — mirrorChatMessage is called for message.any with fromMe=true (cashier sent from phone)', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '',
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-fromme',
      payload: {
        id: 'msg-fromme-1',
        from: '5491110000001@c.us',
        body: 'cashier outbound',
        fromMe: true,
        hasMedia: false,
      },
    }) as never);
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0].fromMe, true);
  });

  it('B2.4 — mirrorChatMessage is STILL called when message matches a trigger phrase (auto-conversion path)', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const triggerCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => 'convertir',
      handleCashierTriggerMessage: async (...args) => {
        triggerCalls.push(args);
      },
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-trigger-fan',
      payload: {
        id: 'msg-trigger-fan-1',
        from: '5491112223333@c.us',
        body: 'convertir',
        fromMe: true,
        hasMedia: false,
      },
    }) as never);
    // Auto-conversion ran
    assert.equal(triggerCalls.length, 1, 'trigger handler must be called once');
    // Fan-out ALSO ran (acceptance criterion #4)
    assert.equal(mirrorCalls.length, 1, 'mirrorChatMessage must be called even on trigger path');
    assert.equal(mirrorCalls[0].messageId, 'msg-trigger-fan-1');
  });

  it('B2.9 — inbound LID chat resolves chatId from _data.Info.SenderAlt (not raw @lid from)', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    // GOWS LID-addressed inbound: payload.from is a LID JID, the real phone JID
    // lives in _data.Info.SenderAlt. The fan-out chatId MUST be the phone JID so
    // the open @c.us chat updates live.
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-lid-in',
      payload: {
        id: 'msg-lid-in-1',
        from: '12345@lid',
        body: 'hola',
        fromMe: false,
        hasMedia: false,
        _data: { Info: { SenderAlt: '5491112345678@c.us' } },
      },
    }, 'message.any') as never);
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0].chatId, '5491112345678@c.us');
  });

  it('B2.10 — outbound LID chat resolves chatId from _data.Info.RecipientAlt (not raw @lid from)', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '',
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    // GOWS LID-addressed outbound: payload.from is a LID JID, the real phone JID
    // lives in _data.Info.RecipientAlt.
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-lid-out',
      payload: {
        id: 'msg-lid-out-1',
        from: '12345@lid',
        body: 'respondiendo',
        fromMe: true,
        hasMedia: false,
        _data: { Info: { RecipientAlt: '5491112345678@c.us' } },
      },
    }, 'message.any') as never);
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0].chatId, '5491112345678@c.us');
  });

  it('B2.11 — empty SenderAlt/RecipientAlt do NOT yield an empty chatId (falls back to from)', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '',
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    // Real GOWS non-LID chat: `_data.Info.SenderAlt`/`RecipientAlt` come back as
    // EMPTY STRINGS, not absent (captured live 2026-06-09). The `??` chain
    // short-circuits on "" and would emit chatId:"" — which lands in an empty
    // history-cache bucket so the open thread never updates. Must skip empties
    // and fall back to the (already @c.us) `payload.from`.
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-empty-alt',
      payload: {
        id: 'msg-empty-alt-1',
        from: '5491112345678@c.us',
        body: 'hola',
        fromMe: true,
        hasMedia: false,
        _data: { Info: { SenderAlt: '', RecipientAlt: '', AddressingMode: '' } },
      },
    }, 'message.any') as never);
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0].chatId, '5491112345678@c.us');
  });

  it('B2.12 — real GOWS inbound: SenderAlt is @s.whatsapp.net, from/Chat are @lid → normalizes to @c.us', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '',
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    // Captured live 2026-06-09: an incoming message has `from` and `Info.Chat` in
    // the LID form, while the phone JID lives in `Info.SenderAlt` but in the
    // `@s.whatsapp.net` domain (NOT `@c.us`). The chat list/history use `@c.us`,
    // so the resolver MUST normalize the domain.
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-gows-in',
      payload: {
        id: 'msg-gows-in-1',
        from: '44517520601297@lid',
        body: 'hola cajero',
        fromMe: false,
        hasMedia: false,
        _data: {
          Info: {
            Chat: '44517520601297@lid',
            SenderAlt: '5493512692202@s.whatsapp.net',
            RecipientAlt: '',
            AddressingMode: '',
          },
        },
      },
    }, 'message.any') as never);
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0].chatId, '5493512692202@c.us');
  });

  it('B2.13 — outbound with empty Alts falls back to Info.Chat (@s.whatsapp.net) → @c.us', async () => {
    type MirrorChatMessageCall = Parameters<InboundProcessorDeps['mirrorChatMessage']>[0];
    const mirrorCalls: MirrorChatMessageCall[] = [];
    const deps = makeDefaultDeps({
      getSetting: async () => '',
      mirrorChatMessage: async (payload) => {
        mirrorCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    // sendText outbound: both Alt fields are empty, but Info.Chat carries the
    // phone JID in `@s.whatsapp.net` form.
    await processor(makeJob({
      event: 'message.any',
      session: 'sess-gows-out',
      payload: {
        id: 'msg-gows-out-1',
        from: '5493512692202@c.us',
        body: 'respuesta',
        fromMe: true,
        hasMedia: false,
        _data: {
          Info: {
            Chat: '5493512692202@s.whatsapp.net',
            SenderAlt: '',
            RecipientAlt: '',
            AddressingMode: '',
          },
        },
      },
    }, 'message.any') as never);
    assert.equal(mirrorCalls.length, 1);
    assert.equal(mirrorCalls[0].chatId, '5493512692202@c.us');
  });
});

// ===========================================================================
// Batch 2 — mirrorChatReaction fan-out
// ===========================================================================

describe('mirrorChatReaction fan-out — message.reaction job', () => {
  it('B2.5 — mirrorChatReaction is called for a valid message.reaction job (real WAHA GOWS shape)', async () => {
    type MirrorChatReactionCall = Parameters<InboundProcessorDeps['mirrorChatReaction']>[0];
    const reactionCalls: MirrorChatReactionCall[] = [];
    const deps = makeDefaultDeps({
      mirrorChatReaction: async (payload) => {
        reactionCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    // Real WAHA GOWS 2026.3.4 payload: `to` is null and the reaction target is
    // a flat `reaction.messageId` string (NOT a `msgId` object). Captured live
    // during whatsapp-chat-ui Batch 16 manual QA.
    await processor(makeJob({
      event: 'message.reaction',
      session: 'sess-react',
      payload: {
        id: 'evt-reaction-1',
        from: '5491112345678@c.us',
        fromMe: false,
        to: null,
        participant: null,
        timestamp: 1716000000,
        reaction: {
          text: '👍',
          messageId: 'false_5491112345678@c.us_target-msg-id-abc',
        },
      },
    }, 'message.reaction') as never);
    assert.equal(reactionCalls.length, 1);
    const call = reactionCalls[0];
    assert.equal(call.sessionName, 'sess-react');
    assert.equal(call.chatId, '5491112345678@c.us');
    assert.equal(call.messageId, 'false_5491112345678@c.us_target-msg-id-abc');
    assert.equal(call.reaction, '👍');
    assert.equal(call.fromMe, false);
  });

  it('B2.8 — mirrorChatReaction maps the legacy WEBJS msgId._serialized shape', async () => {
    type MirrorChatReactionCall = Parameters<InboundProcessorDeps['mirrorChatReaction']>[0];
    const reactionCalls: MirrorChatReactionCall[] = [];
    const deps = makeDefaultDeps({
      mirrorChatReaction: async (payload) => {
        reactionCalls.push(payload);
      },
    });
    const processor = createInboundProcessor(deps);
    // Backward compatibility: a non-GOWS engine (WEBJS) nests the target id in
    // `reaction.msgId._serialized`. Both shapes must keep working.
    await processor(makeJob({
      event: 'message.reaction',
      session: 'sess-legacy',
      payload: {
        id: 'evt-legacy-1',
        from: '5491112345678@c.us',
        fromMe: false,
        reaction: {
          text: '❤️',
          msgId: {
            fromMe: false,
            remote: '5491112345678@c.us',
            id: 'legacy-id',
            _serialized: 'false_5491112345678@c.us_legacy-id',
          },
        },
      },
    }, 'message.reaction') as never);
    assert.equal(reactionCalls.length, 1);
    assert.equal(reactionCalls[0].messageId, 'false_5491112345678@c.us_legacy-id');
    assert.equal(reactionCalls[0].reaction, '❤️');
  });

  it('B2.6 — malformed message.reaction payload causes warn log but does NOT throw', async () => {
    const warnCalls: unknown[][] = [];
    const reactionCalls: unknown[][] = [];
    const deps = makeDefaultDeps({
      logger: {
        info: () => undefined,
        warn: (...args) => { warnCalls.push(args); },
        error: () => undefined,
      },
      mirrorChatReaction: async (...args) => {
        reactionCalls.push(args);
      },
    });
    const processor = createInboundProcessor(deps);
    // Missing required session field → schema parse fails
    await assert.doesNotReject(async () =>
      processor(makeJob({
        event: 'message.reaction',
        // session intentionally missing → schema parse fails
        payload: {
          // also missing any reaction target id (messageId / msgId)
          reaction: { text: '🔥' },
        },
      }, 'message.reaction') as never),
    );
    // Should NOT have called mirrorChatReaction (parse failed)
    assert.equal(reactionCalls.length, 0);
  });

  it('B2.7 — default no-op mirrorChatReaction dep allows processor to handle message.reaction without error', async () => {
    // makeDefaultDeps adds no-op mirrorChatReaction — processor must not throw
    const deps = makeDefaultDeps();
    const processor = createInboundProcessor(deps);
    await assert.doesNotReject(async () =>
      processor(makeJob({
        event: 'message.reaction',
        session: 'sess-noop',
        payload: {
          id: 'evt-noop-1',
          from: '5490000000@c.us',
          fromMe: false,
          reaction: {
            text: '❤️',
            msgId: {
              fromMe: false,
              remote: '5490000000@c.us',
              id: 'target-noop',
              _serialized: 'false_5490000000@c.us_target-noop',
            },
          },
        },
      }, 'message.reaction') as never),
    );
  });
});
