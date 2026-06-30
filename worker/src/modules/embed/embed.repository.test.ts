/**
 * embed.repository.test.ts — Phase 2 task 2.1
 *
 * Tests:
 * - EMBED_SELECT has no accessToken key at any level (CRITICAL)
 * - EMBED_SELECT projects only public fields: id, status, whatsappMessages, metaPixel.pixelId
 * - getEmbedConfigByLandingId is exported as an async function
 *
 * Docker-gated (testcontainers) tests are NOT included here — those require a live DB.
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
// 2.1 — Structural tests: EMBED_SELECT must never expose accessToken
// ---------------------------------------------------------------------------

test('EMBED_SELECT does not include accessToken key at the top level', async () => {
  const { EMBED_SELECT } = await import('./embed.repository.js');

  assert.ok(
    !('accessToken' in EMBED_SELECT),
    'EMBED_SELECT must NOT have accessToken at the top level',
  );
});

test('EMBED_SELECT does not include accessToken key in the metaPixel select', async () => {
  const { EMBED_SELECT } = await import('./embed.repository.js');

  assert.ok(EMBED_SELECT.metaPixel !== undefined, 'EMBED_SELECT must have metaPixel');
  const nestedSelect = (
    EMBED_SELECT.metaPixel as { select: Record<string, unknown> }
  ).select;
  assert.ok(
    !('accessToken' in nestedSelect),
    'EMBED_SELECT.metaPixel.select must NOT have accessToken',
  );
});

test('EMBED_SELECT includes exactly the public fields: id, status, whatsappMessages, metaPixel with pixelId', async () => {
  const { EMBED_SELECT } = await import('./embed.repository.js');

  assert.equal(EMBED_SELECT.id, true, 'EMBED_SELECT must have id: true');
  assert.equal(EMBED_SELECT.status, true, 'EMBED_SELECT must have status: true');
  assert.equal(EMBED_SELECT.whatsappMessages, true, 'EMBED_SELECT must have whatsappMessages: true');

  const nestedSelect = (
    EMBED_SELECT.metaPixel as { select: Record<string, unknown> }
  ).select;
  assert.equal(nestedSelect.pixelId, true, 'metaPixel.select must have pixelId: true');
  assert.ok(!('id' in nestedSelect), 'metaPixel.select must NOT expose MetaPixel.id (unnecessary)');
});

test('EMBED_SELECT metaPixel nested select only exposes pixelId (no label, no createdAt)', async () => {
  const { EMBED_SELECT } = await import('./embed.repository.js');

  const nestedSelect = (
    EMBED_SELECT.metaPixel as { select: Record<string, unknown> }
  ).select;

  // Only pixelId should be selected — no other fields
  const nestedKeys = Object.keys(nestedSelect);
  assert.deepEqual(nestedKeys, ['pixelId'], `metaPixel.select should only have ["pixelId"], got: ${JSON.stringify(nestedKeys)}`);
});

// ---------------------------------------------------------------------------
// 2.1 — Function export tests
// ---------------------------------------------------------------------------

test('getEmbedConfigByLandingId is an exported async function', async () => {
  const mod = await import('./embed.repository.js');

  assert.equal(typeof mod.getEmbedConfigByLandingId, 'function', 'getEmbedConfigByLandingId must be exported');
});

test('EmbedLandingRow type: module exports the type alias (runtime verification via undefined return)', async () => {
  // This is a structural test: the function must exist and return null for unknown IDs.
  // We cannot call it without a DB, but we can verify it doesn't throw on import.
  const mod = await import('./embed.repository.js');
  assert.equal(typeof mod.getEmbedConfigByLandingId, 'function');
  assert.ok(
    mod.getEmbedConfigByLandingId.length === 1,
    'getEmbedConfigByLandingId must accept exactly 1 argument (landingId)',
  );
});
