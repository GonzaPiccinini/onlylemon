/**
 * auto-conversion/service.test.ts
 *
 * Tests for the auto-conversion orchestrator service.
 * Uses injectable dependencies (factory pattern) — no real WAHA / OpenAI / Redis /
 * Prisma calls are made.
 *
 * Strict TDD: written RED before service.ts exists.
 *
 * 12 scenarios covering the full handleCashierTriggerMessage contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal env stubs (must come before any project imports)
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
// Imports — error classes to inspect reply strings
// ---------------------------------------------------------------------------

import {
  BudgetExceededError,
  NoImageFoundError,
  MediaDownloadError,
  OcrUnreadableError,
  LeadNotFoundError,
  AmountBelowMinError,
  AmountAboveMaxError,
  toSpanishReply,
} from './errors.js';

import { createAutoConversionService } from './service.js';
import type { TriggerPayload, AutoConversionDeps } from './service.js';
import type { WahaMessage } from '../../integrations/waha/client.js';

// ---------------------------------------------------------------------------
// Test helpers / factory for default happy-path deps
// ---------------------------------------------------------------------------

const TRIGGER_PHRASE = 'fichas cargadas!';
const CASHIER_ID = 'cashier-abc';
const SESSION_NAME = 'cashier-session-1';
const CHAT_ID = '5491112345678@c.us';
const MESSAGE_ID = 'msg-trigger-001';
const LEAD_ID = 'lead-xyz';
const IMAGE_URL = 'http://waha/media/abc.jpg';
const IMAGE_MIMETYPE = 'image/jpeg';
const OCR_AMOUNT = 5000;

/** Build a WahaMessage with optional media */
function makeMsg(
  id: string,
  opts: {
    hasMedia?: boolean;
    mimetype?: string;
    url?: string;
    fromMe?: boolean;
  } = {},
): WahaMessage {
  return {
    id,
    timestamp: Date.now(),
    fromMe: opts.fromMe ?? false,
    body: '',
    hasMedia: opts.hasMedia ?? false,
    ...(opts.hasMedia && opts.mimetype
      ? {
          media: {
            url: opts.url ?? IMAGE_URL,
            mimetype: opts.mimetype,
            s3: { Bucket: 'test-bucket', Key: `media/${id}` },
          },
        }
      : {}),
  };
}

/** A set of 20 text messages (no media) */
function makeTextMessages(count = 20): WahaMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMsg(`msg-${i}`, { hasMedia: false }),
  );
}

/** Default payload for the trigger message */
const DEFAULT_PAYLOAD: TriggerPayload = {
  sessionName: SESSION_NAME,
  chatId: CHAT_ID,
  messageId: MESSAGE_ID,
  body: TRIGGER_PHRASE,
  fromMe: true,
};

/** Captured sendText calls */
type SendTextCall = { sessionName: string; chatId: string; text: string };

// PNG magic bytes for fake PNG buffer in stubs
const FAKE_PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FAKE_PNG_BUFFER = Buffer.concat([FAKE_PNG_MAGIC, Buffer.alloc(100, 0)]);

/** Build the default happy-path deps with overrides */
function makeDeps(overrides: Partial<AutoConversionDeps> = {}): {
  deps: AutoConversionDeps;
  sendTextCalls: SendTextCall[];
  createConversionCalls: unknown[];
  budgetCalls: string[];
  extractAmountCalls: number;
  fetchMessagesCalls: number;
  downloadMediaCalls: number;
  deleteReceiptCalls: { bucket: string; key: string }[];
  renderPdfCalls: { buffer: Buffer }[];
  warnLogs: unknown[];
} {
  const sendTextCalls: SendTextCall[] = [];
  const createConversionCalls: unknown[] = [];
  const budgetCalls: string[] = [];
  const deleteReceiptCalls: { bucket: string; key: string }[] = [];
  const renderPdfCalls: { buffer: Buffer }[] = [];
  const warnLogs: unknown[] = [];
  let extractAmountCalls = 0;
  let fetchMessagesCalls = 0;
  let downloadMediaCalls = 0;

  const defaultDeps: AutoConversionDeps = {
    getTriggerPhrase: async () => TRIGGER_PHRASE,
    getMinAmount: async () => 0,
    getMaxAmount: async () => 0,
    getOwnChatId: async () => null,
    resolveCashierIdBySession: async (_sessionName: string) => CASHIER_ID,
    fetchChatMessages: async (_session: string, _chatId: string, _opts: { limit: number }) => {
      fetchMessagesCalls++;
      // Return a list that has an image message as the most recent media
      return [makeMsg('msg-image-1', { hasMedia: true, mimetype: IMAGE_MIMETYPE, url: IMAGE_URL })];
    },
    downloadMedia: async (_url: string) => {
      downloadMediaCalls++;
      return { buffer: Buffer.from('fake-image'), mimetype: IMAGE_MIMETYPE };
    },
    extractAmountFromImage: async (_buf: Buffer, _mimetype: string) => {
      extractAmountCalls++;
      return OCR_AMOUNT;
    },
    findLeadByPhoneForCashier: async (_phone: string, _cashierId: string) => ({
      code: 'QA-TEST-001',
      id: LEAD_ID,
      status: 'CONTACTED',
    }),
    createConversion: async (
      cashierId: string,
      leadId: string,
      amount: number,
      options: { source: 'AUTO_OCR'; sourceMessageId: string },
    ) => {
      createConversionCalls.push({ cashierId, leadId, amount, options });
      return { kind: 'CREATED' as const, conversion: { id: 'conv-1' } };
    },
    budgetCheckAndIncrement: async (cashierId: string) => {
      budgetCalls.push(cashierId);
    },
    sendText: async (sessionName: string, chatId: string, text: string) => {
      sendTextCalls.push({ sessionName, chatId, text });
    },
    deleteReceipt: async (bucket: string, key: string) => {
      deleteReceiptCalls.push({ bucket, key });
    },
    renderPdfFirstPageToPng: async (pdfBuffer: Buffer) => {
      renderPdfCalls.push({ buffer: pdfBuffer });
      return FAKE_PNG_BUFFER;
    },
    logger: {
      info: () => {},
      warn: (...args: unknown[]) => { warnLogs.push(args); },
      error: () => {},
    },
    lookbackLimit: 20,
  };

  return {
    deps: { ...defaultDeps, ...overrides },
    sendTextCalls,
    createConversionCalls,
    budgetCalls,
    extractAmountCalls,
    fetchMessagesCalls,
    downloadMediaCalls,
    deleteReceiptCalls,
    renderPdfCalls,
    warnLogs,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: trigger phrase unset → silent return
// ---------------------------------------------------------------------------

test('scenario 1: trigger phrase unset (empty string) → returns silently, no deps called', async () => {
  const { deps, sendTextCalls, budgetCalls, fetchMessagesCalls } = makeDeps({
    getTriggerPhrase: async () => '',
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 0, 'sendText must not be called');
  assert.equal(budgetCalls.length, 0, 'budget must not be checked');
  assert.equal(fetchMessagesCalls, 0, 'fetchChatMessages must not be called');
});

// ---------------------------------------------------------------------------
// Scenario 2: fromMe=false → silent return
// ---------------------------------------------------------------------------

test('scenario 2: fromMe=false → returns silently regardless of body', async () => {
  const { deps, sendTextCalls, budgetCalls, fetchMessagesCalls } = makeDeps();
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage({
    ...DEFAULT_PAYLOAD,
    fromMe: false,
  });

  assert.equal(sendTextCalls.length, 0);
  assert.equal(budgetCalls.length, 0);
  assert.equal(fetchMessagesCalls, 0);
});

// ---------------------------------------------------------------------------
// Scenario 3: body does NOT match trigger (case-insensitive after trim)
// ---------------------------------------------------------------------------

test('scenario 3: body does not match trigger phrase → silent', async () => {
  const { deps, sendTextCalls, fetchMessagesCalls } = makeDeps();
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage({
    ...DEFAULT_PAYLOAD,
    body: 'hello world',
  });

  assert.equal(sendTextCalls.length, 0);
  assert.equal(fetchMessagesCalls, 0);
});

test('scenario 3b: body matches trigger phrase case-insensitively → flow proceeds', async () => {
  const { deps, sendTextCalls, createConversionCalls } = makeDeps();
  const service = createAutoConversionService(deps);

  // "FICHAS CARGADAS!" should match trigger "fichas cargadas!" after trim+lowercase
  await service.handleCashierTriggerMessage({
    ...DEFAULT_PAYLOAD,
    body: '  FICHAS CARGADAS!  ',
  });

  // No error reply, conversion created
  assert.equal(sendTextCalls.length, 0, 'no error reply should be sent on success');
  assert.equal(createConversionCalls.length, 1, 'conversion should be created');
});

// ---------------------------------------------------------------------------
// Scenario 4: session not mapped to a cashier → silent
// ---------------------------------------------------------------------------

test('scenario 4: resolveCashierIdBySession returns null → silent (no reply)', async () => {
  const { deps, sendTextCalls, fetchMessagesCalls } = makeDeps({
    resolveCashierIdBySession: async () => null,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 0, 'no reply when session not mapped');
  assert.equal(fetchMessagesCalls, 0, 'no messages fetched');
});

// ---------------------------------------------------------------------------
// Scenario 5: budget exceeded → sendText BudgetExceededError reply, no OCR
// ---------------------------------------------------------------------------

test('scenario 5: budget exceeded → sends BudgetExceededError reply, no OCR call', async () => {
  const { deps, sendTextCalls, extractAmountCalls } = makeDeps({
    budgetCheckAndIncrement: async () => {
      throw new BudgetExceededError();
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 1, 'must send exactly one reply');
  assert.equal(sendTextCalls[0].sessionName, SESSION_NAME);
  assert.equal(sendTextCalls[0].chatId, CHAT_ID);
  assert.ok(sendTextCalls[0].text.startsWith('❌ Carga automática fallida'));
  assert.ok(sendTextCalls[0].text.includes(toSpanishReply(new BudgetExceededError())));
  assert.equal(extractAmountCalls, 0, 'OCR must not be called when budget exceeded');
});

// ---------------------------------------------------------------------------
// Scenario 6: no image in 20 messages → sendText NoImageFoundError reply
// ---------------------------------------------------------------------------

test('scenario 6: no image in 20 messages → sends NoImageFoundError reply', async () => {
  const { deps, sendTextCalls } = makeDeps({
    fetchChatMessages: async () => makeTextMessages(20),
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 1);
  assert.ok(sendTextCalls[0].text.startsWith('❌ Carga automática fallida'));
  assert.ok(sendTextCalls[0].text.includes(toSpanishReply(new NoImageFoundError())));
});

// ---------------------------------------------------------------------------
// Scenario 7 (UPDATED Pase 3): PDF is now valid — flow succeeds when PDF is most recent
// ---------------------------------------------------------------------------

const PDF_URL = 'http://waha/doc.pdf';
const PDF_MIMETYPE = 'application/pdf';
const PDF_BUFFER = Buffer.from('%PDF-1.4 fake');

test('scenario 7 (pase3): PDF is most recent media → renderPdfFirstPageToPng called, OCR receives PNG buffer', async () => {
  let capturedOcrBuf: Buffer | null = null;
  let capturedOcrMimetype: string | null = null;
  let capturedDownloadUrl: string | null = null;

  const { deps, sendTextCalls, createConversionCalls, renderPdfCalls } = makeDeps({
    fetchChatMessages: async () => [
      makeMsg('pdf-msg', { hasMedia: true, mimetype: PDF_MIMETYPE, url: PDF_URL }),
      makeMsg('img-msg', { hasMedia: true, mimetype: 'image/jpeg', url: IMAGE_URL }),
      ...makeTextMessages(5),
    ],
    downloadMedia: async (url: string) => {
      capturedDownloadUrl = url;
      return { buffer: PDF_BUFFER, mimetype: PDF_MIMETYPE };
    },
    extractAmountFromImage: async (buf: Buffer, mimetype: string) => {
      capturedOcrBuf = buf;
      capturedOcrMimetype = mimetype;
      return OCR_AMOUNT;
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  // No error reply
  assert.equal(sendTextCalls.length, 0, 'no error reply when PDF succeeds');

  // Conversion created
  assert.equal(createConversionCalls.length, 1, 'conversion must be created');

  // renderPdfFirstPageToPng must be called once with the downloaded PDF buffer
  assert.equal(renderPdfCalls.length, 1, 'renderPdfFirstPageToPng must be called once');
  assert.deepEqual(renderPdfCalls[0].buffer, PDF_BUFFER, 'render must receive the downloaded PDF buffer');

  // OCR must receive the PNG buffer (FAKE_PNG_BUFFER) with image/png mimetype
  assert.ok(capturedOcrBuf !== null, 'extractAmountFromImage must be called');
  assert.deepEqual(capturedOcrBuf, FAKE_PNG_BUFFER, 'OCR must receive the rendered PNG buffer');
  assert.equal(capturedOcrMimetype, 'image/png', 'OCR mimetype must be image/png after rendering');

  // downloadMedia must have been called with the PDF URL
  assert.equal(capturedDownloadUrl, PDF_URL, 'downloadMedia must use the PDF URL');
});

test('scenario 7b (pase3): PDF render throws → MediaDownloadError reply, no conversion', async () => {
  const { deps, sendTextCalls, createConversionCalls } = makeDeps({
    fetchChatMessages: async () => [
      makeMsg('pdf-msg', { hasMedia: true, mimetype: PDF_MIMETYPE, url: PDF_URL }),
    ],
    downloadMedia: async () => ({ buffer: PDF_BUFFER, mimetype: PDF_MIMETYPE }),
    renderPdfFirstPageToPng: async () => {
      throw new Error('malformed PDF: invalid xref table');
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 1, 'must send error reply when PDF render fails');
  assert.ok(sendTextCalls[0].text.startsWith('❌ Carga automática fallida'), 'must use rich-format header');
  assert.ok(sendTextCalls[0].text.includes(toSpanishReply(new MediaDownloadError())), 'must include MediaDownloadError reply');
  assert.equal(createConversionCalls.length, 0, 'conversion must NOT be created');
});

test('scenario 7c (pase3): walk-back picks PDF over an older image (most-recent wins, no type bias)', async () => {
  const { deps, sendTextCalls, createConversionCalls, renderPdfCalls } = makeDeps({
    fetchChatMessages: async () => [
      // Most recent: PDF
      makeMsg('pdf-newest', { hasMedia: true, mimetype: PDF_MIMETYPE, url: PDF_URL }),
      // Older: image
      makeMsg('img-older', { hasMedia: true, mimetype: 'image/jpeg', url: IMAGE_URL }),
    ],
    downloadMedia: async () => ({ buffer: PDF_BUFFER, mimetype: PDF_MIMETYPE }),
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 0, 'no error reply');
  assert.equal(createConversionCalls.length, 1, 'conversion created');
  assert.equal(renderPdfCalls.length, 1, 'PDF was rendered (not the older image)');
});

test('scenario 7d (pase3): walk-back skips older PDF if a newer image is present (most-recent rule)', async () => {
  const { deps, sendTextCalls, createConversionCalls, renderPdfCalls } = makeDeps({
    fetchChatMessages: async () => [
      // Most recent: image
      makeMsg('img-newest', { hasMedia: true, mimetype: 'image/jpeg', url: IMAGE_URL }),
      // Older: PDF — must be skipped
      makeMsg('pdf-older', { hasMedia: true, mimetype: PDF_MIMETYPE, url: PDF_URL }),
    ],
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 0, 'no error reply');
  assert.equal(createConversionCalls.length, 1, 'conversion created');
  assert.equal(renderPdfCalls.length, 0, 'renderPdfFirstPageToPng must NOT be called when image is newer');
});

// ---------------------------------------------------------------------------
// Scenario 8: media download fails → sendText MediaDownloadError reply
// ---------------------------------------------------------------------------

test('scenario 8: downloadMedia throws → sends MediaDownloadError reply', async () => {
  const { deps, sendTextCalls } = makeDeps({
    downloadMedia: async () => {
      throw new Error('network timeout');
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 1);
  assert.ok(sendTextCalls[0].text.startsWith('❌ Carga automática fallida'));
  assert.ok(sendTextCalls[0].text.includes(toSpanishReply(new MediaDownloadError())));
});

// ---------------------------------------------------------------------------
// Scenario 9: OCR returns null → sendText OcrUnreadableError reply
// ---------------------------------------------------------------------------

test('scenario 9: extractAmountFromImage returns null → sends OcrUnreadableError reply', async () => {
  const { deps, sendTextCalls } = makeDeps({
    extractAmountFromImage: async () => null,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 1);
  assert.ok(sendTextCalls[0].text.startsWith('❌ Carga automática fallida'));
  assert.ok(sendTextCalls[0].text.includes(toSpanishReply(new OcrUnreadableError())));
});

// ---------------------------------------------------------------------------
// Scenario 10: lead not found → sendText LeadNotFoundError reply
// ---------------------------------------------------------------------------

test('scenario 10: findLeadByPhoneForCashier returns null → sends LeadNotFoundError reply', async () => {
  const { deps, sendTextCalls } = makeDeps({
    findLeadByPhoneForCashier: async () => null,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 1);
  assert.ok(sendTextCalls[0].text.startsWith('❌ Carga automática fallida'));
  assert.ok(sendTextCalls[0].text.includes(toSpanishReply(new LeadNotFoundError())));
});

test('scenario 10b: phone extraction from chatId — digits only from 5491112345678@c.us', async () => {
  let capturedPhone = '';
  const { deps, sendTextCalls } = makeDeps({
    findLeadByPhoneForCashier: async (phone: string) => {
      capturedPhone = phone;
      return { id: LEAD_ID, status: 'CONTACTED', code: 'QA-TEST-001' };
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage({
    ...DEFAULT_PAYLOAD,
    chatId: '5491112345678@c.us',
  });

  // Phone must be digits-only: strip @c.us and any non-digits
  assert.equal(capturedPhone, '5491112345678', 'phone should be normalized to digits only');
  assert.equal(sendTextCalls.length, 0, 'no error reply on success');
});

// ---------------------------------------------------------------------------
// Scenario 11: DUPLICATE → silent log, NO sendText
// ---------------------------------------------------------------------------

test('scenario 11: createConversion returns DUPLICATE → silent (log only, no sendText)', async () => {
  const { deps, sendTextCalls, createConversionCalls } = makeDeps({
    createConversion: async () => ({ kind: 'DUPLICATE' as const, sourceMessageId: MESSAGE_ID }),
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 0, 'DUPLICATE must not send any reply');
  assert.equal(createConversionCalls.length, 0, 'createConversionCalls tracked via the override itself');
});

// ---------------------------------------------------------------------------
// Scenario 12: happy path — everything succeeds
// ---------------------------------------------------------------------------

test('scenario 12: happy path → createConversion called with AUTO_OCR + sourceMessageId, no reply', async () => {
  const { deps, sendTextCalls, createConversionCalls, budgetCalls } = makeDeps();
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  // No error reply
  assert.equal(sendTextCalls.length, 0, 'no sendText on happy path');

  // Budget checked for the resolved cashier
  assert.equal(budgetCalls.length, 1);
  assert.equal(budgetCalls[0], CASHIER_ID);

  // Conversion created with correct args
  assert.equal(createConversionCalls.length, 1);
  const call = createConversionCalls[0] as {
    cashierId: string;
    leadId: string;
    amount: number;
    options: { source: string; sourceMessageId: string };
  };
  assert.equal(call.cashierId, CASHIER_ID);
  assert.equal(call.leadId, LEAD_ID);
  assert.equal(call.amount, OCR_AMOUNT);
  assert.equal(call.options.source, 'AUTO_OCR');
  assert.equal(call.options.sourceMessageId, MESSAGE_ID, 'sourceMessageId must be the trigger message ID');
});

// ---------------------------------------------------------------------------
// Cross-cutting: unknown error → sendText UnexpectedError reply, do NOT rethrow
// ---------------------------------------------------------------------------

test('cross-cutting: unknown error in flow → sends UnexpectedError reply, does not rethrow', async () => {
  const { deps, sendTextCalls } = makeDeps({
    findLeadByPhoneForCashier: async () => {
      throw new Error('some unexpected DB error');
    },
  });
  const service = createAutoConversionService(deps);

  // Must NOT throw — job should succeed for BullMQ
  await assert.doesNotReject(() => service.handleCashierTriggerMessage(DEFAULT_PAYLOAD));

  assert.equal(sendTextCalls.length, 1);
  // The reply should be the unexpected error Spanish message
  assert.ok(
    sendTextCalls[0].text.toLowerCase().includes('error') ||
      sendTextCalls[0].text.toLowerCase().includes('interno'),
    `Expected unexpected error reply, got: ${sendTextCalls[0].text}`,
  );
});

// ---------------------------------------------------------------------------
// Item #6 — Min/Max amount validation
// ---------------------------------------------------------------------------

const CASHIER_OWN_CHAT_ID = '5493513207794@c.us';

test('item #6: min=0 → no min validation, happy path continues', async () => {
  const { deps, createConversionCalls, sendTextCalls } = makeDeps({
    getMinAmount: async () => 0,
    getMaxAmount: async () => 0,
    extractAmountFromImage: async () => 1, // very small amount
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 0, 'no error when min=0');
  assert.equal(createConversionCalls.length, 1, 'conversion created when min=0');
});

test('item #6: max=0 → no max validation, happy path continues', async () => {
  const { deps, createConversionCalls, sendTextCalls } = makeDeps({
    getMinAmount: async () => 0,
    getMaxAmount: async () => 0,
    extractAmountFromImage: async () => 9999999999, // enormous amount
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 0, 'no error when max=0');
  assert.equal(createConversionCalls.length, 1, 'conversion created when max=0');
});

test('item #6: amount below min → AmountBelowMinError reply, no conversion', async () => {
  const { deps, createConversionCalls, sendTextCalls } = makeDeps({
    getMinAmount: async () => 10000,
    getMaxAmount: async () => 0,
    extractAmountFromImage: async () => 5000,
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 1, 'must send error reply');
  assert.equal(createConversionCalls.length, 0, 'conversion must NOT be created');
  assert.ok(
    sendTextCalls[0].text.includes('5.000'),
    `reply must include formatted amount, got: ${sendTextCalls[0].text}`,
  );
  assert.ok(
    sendTextCalls[0].text.includes('10.000'),
    `reply must include formatted min, got: ${sendTextCalls[0].text}`,
  );
});

test('item #6: amount above max → AmountAboveMaxError reply, no conversion', async () => {
  const { deps, createConversionCalls, sendTextCalls } = makeDeps({
    getMinAmount: async () => 0,
    getMaxAmount: async () => 1000000,
    extractAmountFromImage: async () => 5000000,
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 1, 'must send error reply');
  assert.equal(createConversionCalls.length, 0, 'conversion must NOT be created');
  assert.ok(
    sendTextCalls[0].text.includes('1.000.000'),
    `reply must include formatted max, got: ${sendTextCalls[0].text}`,
  );
});

test('item #6: amount exactly at min → valid, conversion created', async () => {
  const { deps, createConversionCalls, sendTextCalls } = makeDeps({
    getMinAmount: async () => 5000,
    getMaxAmount: async () => 0,
    extractAmountFromImage: async () => 5000,
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 0, 'no error at exactly min');
  assert.equal(createConversionCalls.length, 1, 'conversion created at min boundary');
});

test('item #6: amount exactly at max → valid, conversion created', async () => {
  const { deps, createConversionCalls, sendTextCalls } = makeDeps({
    getMinAmount: async () => 0,
    getMaxAmount: async () => 1000000,
    extractAmountFromImage: async () => 1000000,
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 0, 'no error at exactly max');
  assert.equal(createConversionCalls.length, 1, 'conversion created at max boundary');
});

// ---------------------------------------------------------------------------
// Item #2 — Error replies go to cashier's own chat
// ---------------------------------------------------------------------------

test('item #2: when getOwnChatId resolves, sendText uses the own chatId not the trigger chatId', async () => {
  const { deps, sendTextCalls } = makeDeps({
    getOwnChatId: async () => CASHIER_OWN_CHAT_ID,
    // Trigger a known error so we can check the sendText target
    extractAmountFromImage: async () => null,
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 1);
  assert.equal(
    sendTextCalls[0].chatId,
    CASHIER_OWN_CHAT_ID,
    'reply must go to cashier own chat, not client chat',
  );
  assert.notEqual(sendTextCalls[0].chatId, CHAT_ID, 'must NOT send to client chatId');
});

test('item #2: when getOwnChatId returns null, falls back to trigger chatId', async () => {
  const { deps, sendTextCalls } = makeDeps({
    getOwnChatId: async () => null,
    extractAmountFromImage: async () => null,
  });
  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);
  assert.equal(sendTextCalls.length, 1);
  assert.equal(
    sendTextCalls[0].chatId,
    CHAT_ID,
    'when ownChatId is null, must fallback to trigger chatId',
  );
});

// ---------------------------------------------------------------------------
// Item #3 — fromMe=false filter in lookback loop
// ---------------------------------------------------------------------------

test('item #3: cashier-sent image (fromMe=true) is skipped; picks the previous client image', async () => {
  // The walk-back loop must only consider messages with fromMe === false.
  // Arrange: most recent media message is fromMe=true (cashier's own image),
  // then a client image (fromMe=false). The service must skip the cashier's
  // image and pick the client's image.
  let capturedBuffer: Buffer | null = null;
  const CASHIER_IMAGE_URL = 'http://waha/cashier-img.jpg';
  const CLIENT_IMAGE_URL = 'http://waha/client-img.jpg';

  const { deps } = makeDeps({
    fetchChatMessages: async () => [
      // Most recent first: cashier's own image — must be skipped
      makeMsg('cashier-img', { hasMedia: true, mimetype: 'image/jpeg', url: CASHIER_IMAGE_URL, fromMe: true }),
      // Next: client's image — must be picked
      makeMsg('client-img', { hasMedia: true, mimetype: 'image/jpeg', url: CLIENT_IMAGE_URL, fromMe: false }),
      ...makeTextMessages(3),
    ],
    downloadMedia: async (url: string) => {
      // Capture which URL was downloaded so we can assert the correct one was chosen
      capturedBuffer = Buffer.from(url);
      return { buffer: capturedBuffer, mimetype: 'image/jpeg' };
    },
  });

  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  // capturedBuffer should contain the CLIENT_IMAGE_URL bytes, not the cashier one
  assert.ok(capturedBuffer !== null, 'downloadMedia must have been called');
  const captured = capturedBuffer as Buffer;
  assert.equal(
    captured.toString(),
    CLIENT_IMAGE_URL,
    'must download the client image, not the cashier image',
  );
});

test('item #3: when all images are fromMe=true, throws NoImageFoundError', async () => {
  const { deps, sendTextCalls } = makeDeps({
    fetchChatMessages: async () => [
      makeMsg('cashier-img-1', { hasMedia: true, mimetype: 'image/jpeg', url: IMAGE_URL, fromMe: true }),
      makeMsg('cashier-img-2', { hasMedia: true, mimetype: 'image/jpeg', url: IMAGE_URL, fromMe: true }),
    ],
  });

  const service = createAutoConversionService(deps);
  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 1);
  assert.ok(sendTextCalls[0].text.startsWith('❌ Carga automática fallida'));
  assert.ok(sendTextCalls[0].text.includes(toSpanishReply(new NoImageFoundError())));
});

// ---------------------------------------------------------------------------
// Item #4 — Delete from R2 after successful CREATED conversion
// ---------------------------------------------------------------------------

const S3_BUCKET = 'test-bucket';
const S3_KEY = 'media/msg-image-1';

test('item #4: happy path → deleteReceipt called once with correct Bucket+Key', async () => {
  // Default makeDeps returns a message with s3: { Bucket: 'test-bucket', Key: 'media/msg-image-1' }
  const { deps, deleteReceiptCalls, sendTextCalls } = makeDeps();
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(sendTextCalls.length, 0, 'no error reply on happy path');
  assert.equal(deleteReceiptCalls.length, 1, 'deleteReceipt must be called once');
  assert.equal(deleteReceiptCalls[0].bucket, S3_BUCKET);
  assert.equal(deleteReceiptCalls[0].key, S3_KEY);
});

test('item #4: DUPLICATE → deleteReceipt NOT called', async () => {
  const { deps, deleteReceiptCalls } = makeDeps({
    createConversion: async () => ({ kind: 'DUPLICATE' as const, sourceMessageId: MESSAGE_ID }),
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called on DUPLICATE');
});

test('item #4: BudgetExceeded → deleteReceipt NOT called', async () => {
  const { deps, deleteReceiptCalls } = makeDeps({
    budgetCheckAndIncrement: async () => { throw new BudgetExceededError(); },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called on BudgetExceeded');
});

test('item #4: NoImageFound → deleteReceipt NOT called', async () => {
  const { deps, deleteReceiptCalls } = makeDeps({
    fetchChatMessages: async () => makeTextMessages(20),
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called when no image found');
});

test('item #4: OcrUnreadable → deleteReceipt NOT called', async () => {
  const { deps, deleteReceiptCalls } = makeDeps({
    extractAmountFromImage: async () => null,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called on OcrUnreadable');
});

test('item #4: LeadNotFound → deleteReceipt NOT called', async () => {
  const { deps, deleteReceiptCalls } = makeDeps({
    findLeadByPhoneForCashier: async () => null,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called when lead not found');
});

test('item #4: AmountBelowMin → deleteReceipt NOT called', async () => {
  const { deps, deleteReceiptCalls } = makeDeps({
    getMinAmount: async () => 10000,
    extractAmountFromImage: async () => 100,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called on AmountBelowMin');
});

test('item #4: AmountAboveMax → deleteReceipt NOT called', async () => {
  const { deps, deleteReceiptCalls } = makeDeps({
    getMaxAmount: async () => 1000,
    extractAmountFromImage: async () => 9999999,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called on AmountAboveMax');
});

test('item #4: deleteReceipt throws → flow still succeeds (conversion already in DB), warning logged', async () => {
  const deleteError = new Error('R2 403 Forbidden');
  const { deps, warnLogs, sendTextCalls } = makeDeps({
    deleteReceipt: async () => { throw deleteError; },
  });
  const service = createAutoConversionService(deps);

  // Must NOT throw — job should succeed for BullMQ even if delete fails
  await assert.doesNotReject(() => service.handleCashierTriggerMessage(DEFAULT_PAYLOAD));

  // No error reply should be sent (conversion succeeded)
  assert.equal(sendTextCalls.length, 0, 'no error reply when deleteReceipt fails');

  // Warning must be logged with expected fields
  const warnEntry = warnLogs.find((entry) => {
    const obj = (entry as unknown[])[0];
    return typeof obj === 'object' && obj !== null &&
      (obj as Record<string, unknown>).event === 'auto_conversion_receipt_delete_failed';
  });
  assert.ok(warnEntry !== undefined, 'must log warn with event=auto_conversion_receipt_delete_failed');
});

test('item #4: message without s3 metadata → deleteReceipt NOT called (graceful no-op)', async () => {
  // Some messages may not have the s3 field (e.g. older WAHA versions or text messages
  // that somehow have hasMedia=true but no s3 metadata). In this case, skip the delete.
  const { deps, deleteReceiptCalls } = makeDeps({
    fetchChatMessages: async () => [
      {
        id: 'msg-no-s3',
        timestamp: Date.now(),
        fromMe: false,
        body: '',
        hasMedia: true,
        media: {
          url: IMAGE_URL,
          mimetype: IMAGE_MIMETYPE,
          // No s3 field
        },
      } as import('../../integrations/waha/client.js').WahaMessage,
    ],
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  // Conversion should succeed (no error reply), but delete should NOT be called since s3 is missing
  assert.equal(deleteReceiptCalls.length, 0, 'deleteReceipt must NOT be called when s3 metadata is absent');
});

// ---------------------------------------------------------------------------
// Export surface
// ---------------------------------------------------------------------------

test('service module exports createAutoConversionService', async () => {
  const mod = await import('./service.js');
  assert.equal(typeof mod.createAutoConversionService, 'function');
});

test('service module exports handleCashierTriggerMessage (module-level default wiring)', async () => {
  const mod = await import('./service.js');
  assert.equal(typeof mod.handleCashierTriggerMessage, 'function');
});

// ---------------------------------------------------------------------------
// Walk-back lookback: avoid re-uploading old receipts to R2
// ---------------------------------------------------------------------------

test('walk-back: expands limit one at a time until candidate is found', async () => {
  // history (newest-first): trigger (fromMe=true) → text "ok" → receipt image
  // Walk-back should request limit=1, 2, 3 and stop at the receipt.
  const history: WahaMessage[] = [
    makeMsg('msg-trigger', { fromMe: true }),
    makeMsg('msg-text', { hasMedia: false }),
    makeMsg('msg-receipt', { hasMedia: true, mimetype: IMAGE_MIMETYPE, url: IMAGE_URL }),
    makeMsg('msg-old-receipt', { hasMedia: true, mimetype: IMAGE_MIMETYPE, url: 'http://old.jpg' }),
    ...makeTextMessages(10),
  ];
  const requestedLimits: number[] = [];

  let downloadCount = 0;
  const { deps, createConversionCalls } = makeDeps({
    fetchChatMessages: async (_s, _c, opts) => {
      requestedLimits.push(opts.limit);
      return history.slice(0, opts.limit);
    },
    downloadMedia: async () => {
      downloadCount++;
      return { buffer: Buffer.from('fake'), mimetype: IMAGE_MIMETYPE };
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.deepEqual(requestedLimits, [1, 2, 3], 'must walk back limit=1,2,3 and stop');
  assert.equal(createConversionCalls.length, 1, 'conversion created from the first receipt');
  assert.equal(downloadCount, 1, 'only the chosen media is downloaded');
});

test('walk-back: never expands past first candidate (older receipts not touched)', async () => {
  // The receipt is at position [1] (right after the trigger). Walk-back should
  // stop at limit=2 even though older converted receipts exist further back.
  const history: WahaMessage[] = [
    makeMsg('msg-trigger', { fromMe: true }),
    makeMsg('msg-new-receipt', { hasMedia: true, mimetype: IMAGE_MIMETYPE, url: IMAGE_URL }),
    makeMsg('msg-converted-receipt-1', { hasMedia: true, mimetype: IMAGE_MIMETYPE, url: 'http://r1.jpg' }),
    makeMsg('msg-converted-receipt-2', { hasMedia: true, mimetype: IMAGE_MIMETYPE, url: 'http://r2.jpg' }),
  ];
  const requestedLimits: number[] = [];

  const { deps, createConversionCalls } = makeDeps({
    fetchChatMessages: async (_s, _c, opts) => {
      requestedLimits.push(opts.limit);
      return history.slice(0, opts.limit);
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.deepEqual(requestedLimits, [1, 2], 'must stop at limit=2 (first candidate found)');
  assert.equal(createConversionCalls.length, 1);
});

test('walk-back: stops when history is exhausted (length < limit)', async () => {
  // No receipts in the entire history → must request once per available message
  // and then break (when the page returns fewer messages than requested).
  const history: WahaMessage[] = makeTextMessages(3);
  const requestedLimits: number[] = [];

  const { deps, sendTextCalls, createConversionCalls } = makeDeps({
    fetchChatMessages: async (_s, _c, opts) => {
      requestedLimits.push(opts.limit);
      return history.slice(0, opts.limit);
    },
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  // limits 1, 2, 3 each return enough; limit=4 returns only 3 → break
  assert.deepEqual(requestedLimits, [1, 2, 3, 4]);
  assert.equal(createConversionCalls.length, 0);
  // NoImageFoundError reply
  assert.equal(sendTextCalls.length, 1);
});

test('walk-back: respects lookbackLimit cap', async () => {
  const history: WahaMessage[] = makeTextMessages(30); // never any media
  const requestedLimits: number[] = [];

  const { deps, sendTextCalls } = makeDeps({
    fetchChatMessages: async (_s, _c, opts) => {
      requestedLimits.push(opts.limit);
      return history.slice(0, opts.limit);
    },
    lookbackLimit: 5,
  });
  const service = createAutoConversionService(deps);

  await service.handleCashierTriggerMessage(DEFAULT_PAYLOAD);

  assert.deepEqual(requestedLimits, [1, 2, 3, 4, 5], 'must cap at lookbackLimit');
  assert.equal(sendTextCalls.length, 1, 'NoImageFound reply sent');
});
