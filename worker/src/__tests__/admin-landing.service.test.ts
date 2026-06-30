/**
 * Task 3.5 — Admin Landing service tests (STRICT TDD — RED first)
 *
 * Tests:
 * - normalizeWhatsappMessages: trim + filter empty strings
 * - whatsappMessages validation (≤5, each ≤250 chars)
 * - updateLandingServiceImpl extended to accept metaPixelRef FK + whatsappMessages
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
// normalizeWhatsappMessages — pure function
// ---------------------------------------------------------------------------

test('normalizeWhatsappMessages: trims leading/trailing whitespace', async () => {
  const { normalizeWhatsappMessages } = await import('../modules/admin/admin.service.js');

  const result = normalizeWhatsappMessages(['  Hello  ', ' World ']);
  assert.deepEqual(result, ['Hello', 'World']);
});

test('normalizeWhatsappMessages: discards empty and whitespace-only strings', async () => {
  const { normalizeWhatsappMessages } = await import('../modules/admin/admin.service.js');

  const result = normalizeWhatsappMessages(['Hello', '', '  ', 'World']);
  assert.deepEqual(result, ['Hello', 'World']);
});

test('normalizeWhatsappMessages: 4 non-empty + 3 empty → 4 messages (empties discarded before count)', async () => {
  const { normalizeWhatsappMessages } = await import('../modules/admin/admin.service.js');

  const input = ['Msg1', 'Msg2', '', 'Msg3', '   ', 'Msg4', ''];
  const result = normalizeWhatsappMessages(input);
  assert.equal(result.length, 4);
  assert.deepEqual(result, ['Msg1', 'Msg2', 'Msg3', 'Msg4']);
});

test('normalizeWhatsappMessages: empty array stays empty', async () => {
  const { normalizeWhatsappMessages } = await import('../modules/admin/admin.service.js');

  const result = normalizeWhatsappMessages([]);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// validateWhatsappMessages — pure validation (throws on violation)
// ---------------------------------------------------------------------------

test('validateWhatsappMessages: 6 non-empty messages → throws WhatsappMessagesTooManyError', async () => {
  const { validateWhatsappMessages, WhatsappMessagesTooManyError } = await import('../modules/admin/admin.service.js');

  const sixMessages = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.throws(
    () => validateWhatsappMessages(sixMessages),
    (err: unknown) => err instanceof WhatsappMessagesTooManyError,
  );
});

test('validateWhatsappMessages: 5 non-empty messages → accepted (no throw)', async () => {
  const { validateWhatsappMessages } = await import('../modules/admin/admin.service.js');

  const fiveMessages = ['a', 'b', 'c', 'd', 'e'];
  assert.doesNotThrow(() => validateWhatsappMessages(fiveMessages));
});

test('validateWhatsappMessages: message of 251 chars → throws WhatsappMessageTooLongError', async () => {
  const { validateWhatsappMessages, WhatsappMessageTooLongError } = await import('../modules/admin/admin.service.js');

  const longMessage = 'x'.repeat(251);
  assert.throws(
    () => validateWhatsappMessages([longMessage]),
    (err: unknown) => err instanceof WhatsappMessageTooLongError,
  );
});

test('validateWhatsappMessages: message of exactly 250 chars → accepted', async () => {
  const { validateWhatsappMessages } = await import('../modules/admin/admin.service.js');

  const msg250 = 'x'.repeat(250);
  assert.doesNotThrow(() => validateWhatsappMessages([msg250]));
});

// ---------------------------------------------------------------------------
// updateLandingServiceImpl — pixel FK selector (task 3.7)
// ---------------------------------------------------------------------------

const makeLandingRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'land-1',
  url: 'https://example.com',
  metaPixelId: '976916338006290',
  metaAccessToken: 'old-token',
  metaPixelRef: null as string | null,
  whatsappMessages: [] as string[],
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

test('updateLandingServiceImpl: pixel assigned via metaPixelRef FK', async () => {
  const { updateLandingServiceImpl } = await import('../modules/admin/admin.service.js');

  let capturedInput: Record<string, unknown> | undefined;
  const deps = {
    updateLanding: async (id: string, input: Record<string, unknown>) => {
      capturedInput = input;
      return makeLandingRow({ metaPixelRef: input['metaPixelRef'] as string });
    },
    replaceLandingFallbacks: async () => {},
  };

  await updateLandingServiceImpl(
    deps,
    'land-1',
    {
      url: 'https://example.com',
      metaPixelRef: 'mp-uuid-123',
    },
  );

  assert.equal(capturedInput?.['metaPixelRef'], 'mp-uuid-123');
});

test('updateLandingServiceImpl: change pixel = reassign FK (P1 row untouched - no in-place edit)', async () => {
  const { updateLandingServiceImpl } = await import('../modules/admin/admin.service.js');

  let capturedLandingId: string | undefined;
  let capturedMetaPixelRef: string | undefined;
  const deps = {
    updateLanding: async (id: string, input: Record<string, unknown>) => {
      capturedLandingId = id;
      capturedMetaPixelRef = input['metaPixelRef'] as string;
      return makeLandingRow({ metaPixelRef: input['metaPixelRef'] as string });
    },
    replaceLandingFallbacks: async () => {},
  };

  // Admin changes landing land-1 from pixel P1 to pixel P2
  await updateLandingServiceImpl(
    deps,
    'land-1',
    {
      url: 'https://example.com',
      metaPixelRef: 'mp-P2-uuid',
    },
  );

  // The landing was updated with the new FK — P1 row is NOT touched (we only update the landing)
  assert.equal(capturedLandingId, 'land-1');
  assert.equal(capturedMetaPixelRef, 'mp-P2-uuid');
  // No metaPixelRef for P1 passed anywhere (P1 row untouched is implicit: we never touch MetaPixel rows)
});

// ---------------------------------------------------------------------------
// updateLandingServiceImpl — whatsappMessages flow
// ---------------------------------------------------------------------------

test('updateLandingServiceImpl: whatsappMessages saved when provided', async () => {
  const { updateLandingServiceImpl } = await import('../modules/admin/admin.service.js');

  let savedMessages: string[] | undefined;
  const deps = {
    updateLanding: async (_id: string, input: Record<string, unknown>) => {
      savedMessages = input['whatsappMessages'] as string[];
      return makeLandingRow({ whatsappMessages: savedMessages ?? [] });
    },
    replaceLandingFallbacks: async () => {},
  };

  await updateLandingServiceImpl(
    deps,
    'land-1',
    {
      url: 'https://example.com',
      metaPixelId: 'px-123',
      whatsappMessages: ['Hello', '  World  '],
    },
  );

  // Messages should be trimmed by the service before passing to repo
  assert.deepEqual(savedMessages, ['Hello', 'World']);
});

test('updateLandingServiceImpl: 6 non-empty messages → throws WhatsappMessagesTooManyError', async () => {
  const { updateLandingServiceImpl, WhatsappMessagesTooManyError } = await import('../modules/admin/admin.service.js');

  const deps = {
    updateLanding: async () => makeLandingRow(),
    replaceLandingFallbacks: async () => {},
  };

  const sixMessages = ['a', 'b', 'c', 'd', 'e', 'f'];
  await assert.rejects(
    () => updateLandingServiceImpl(deps, 'land-1', { url: 'https://example.com', metaPixelId: 'px', whatsappMessages: sixMessages }),
    (err: unknown) => err instanceof WhatsappMessagesTooManyError,
  );
});

test('updateLandingServiceImpl: message >250 chars → throws WhatsappMessageTooLongError', async () => {
  const { updateLandingServiceImpl, WhatsappMessageTooLongError } = await import('../modules/admin/admin.service.js');

  const deps = {
    updateLanding: async () => makeLandingRow(),
    replaceLandingFallbacks: async () => {},
  };

  const longMsg = 'x'.repeat(251);
  await assert.rejects(
    () => updateLandingServiceImpl(deps, 'land-1', { url: 'https://example.com', metaPixelId: 'px', whatsappMessages: [longMsg] }),
    (err: unknown) => err instanceof WhatsappMessageTooLongError,
  );
});

test('updateLandingServiceImpl: 4 non-empty + 3 empty → accepted (empties discarded)', async () => {
  const { updateLandingServiceImpl } = await import('../modules/admin/admin.service.js');

  let savedMessages: string[] | undefined;
  const deps = {
    updateLanding: async (_id: string, input: Record<string, unknown>) => {
      savedMessages = input['whatsappMessages'] as string[];
      return makeLandingRow({ whatsappMessages: savedMessages ?? [] });
    },
    replaceLandingFallbacks: async () => {},
  };

  await assert.doesNotReject(() =>
    updateLandingServiceImpl(deps, 'land-1', {
      url: 'https://example.com',
      metaPixelId: 'px',
      whatsappMessages: ['Msg1', 'Msg2', '', 'Msg3', '   ', 'Msg4', ''],
    }),
  );

  // After discarding 3 empties: 4 messages remain
  assert.equal(savedMessages?.length, 4);
});

// ---------------------------------------------------------------------------
// Export surface
// ---------------------------------------------------------------------------

test('admin.service exports normalizeWhatsappMessages pure function', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.normalizeWhatsappMessages, 'function');
});

test('admin.service exports validateWhatsappMessages pure function', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.validateWhatsappMessages, 'function');
});

test('admin.service exports WhatsappMessagesTooManyError class', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.WhatsappMessagesTooManyError, 'function');
  const err = new mod.WhatsappMessagesTooManyError(6);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'WhatsappMessagesTooManyError');
});

test('admin.service exports WhatsappMessageTooLongError class', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.WhatsappMessageTooLongError, 'function');
  const err = new mod.WhatsappMessageTooLongError(251);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'WhatsappMessageTooLongError');
});
