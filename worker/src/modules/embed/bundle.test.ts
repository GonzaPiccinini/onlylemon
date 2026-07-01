/**
 * bundle.test.ts — Phase 2 task 2.3 (RED) + solver round-trip
 *
 * Tests renderEmbedBundle, safeJsonSerialize, computeEmbedETag, and the
 * exported solveAltchaChallenge (used for round-trip verification).
 *
 * Web Crypto (crypto.subtle) is available in Node 18+ via globalThis.crypto.
 * The solver round-trip uses altcha-lib/v1 createChallenge with a small
 * maxnumber (10) so the search completes in milliseconds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge } from 'altcha-lib/v1';

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

// Test fixture — config with token-bearing pixel (token must NEVER appear in bundle)
const MOCK_ACCESS_TOKEN = 'EAABwzLXX_MOCK_ACCESS_TOKEN_MUST_NOT_APPEAR';

const FIXTURE_CONFIG = {
  landingId: 'test-landing-uuid-123',
  pixelId: '976916338006290',
  messages: ['¡Hola! Quiero crear un usuario.', 'Hola, vengo por el anuncio.'],
};

// ---------------------------------------------------------------------------
// safeJsonSerialize
// ---------------------------------------------------------------------------

test('safeJsonSerialize escapes </script> tag to prevent XSS breakout', async () => {
  const { safeJsonSerialize } = await import('./bundle.js');

  const result = safeJsonSerialize('<script>alert(1)</script>');
  assert.ok(!result.includes('</script>'), 'serialized output must NOT contain </script>');
  assert.ok(result.includes('\\u003c/script\\u003e'), 'must escape < and > as unicode escapes');
});

test('safeJsonSerialize escapes > character', async () => {
  const { safeJsonSerialize } = await import('./bundle.js');

  const result = safeJsonSerialize('a>b');
  assert.ok(!result.includes('>'), 'serialized output must NOT contain unescaped >');
  assert.ok(result.includes('\\u003e'), 'must escape > as \\u003e');
});

test('safeJsonSerialize escapes & character', async () => {
  const { safeJsonSerialize } = await import('./bundle.js');

  const result = safeJsonSerialize('a&b');
  assert.ok(!result.includes('&'), 'serialized output must NOT contain unescaped &');
  assert.ok(result.includes('\\u0026'), 'must escape & as \\u0026');
});

test('safeJsonSerialize preserves valid JSON structure', async () => {
  const { safeJsonSerialize } = await import('./bundle.js');

  const obj = { a: 1, b: 'hello' };
  const result = safeJsonSerialize(obj);
  const parsed = JSON.parse(result);
  assert.deepEqual(parsed, obj, 'serialized JSON must be parseable and equal the input');
});

// ---------------------------------------------------------------------------
// computeEmbedETag
// ---------------------------------------------------------------------------

test('computeEmbedETag returns a quoted string (HTTP ETag format)', async () => {
  const { computeEmbedETag } = await import('./bundle.js');

  const etag = computeEmbedETag(FIXTURE_CONFIG);
  assert.ok(etag.startsWith('"') && etag.endsWith('"'), `ETag must be a quoted string, got: ${etag}`);
  assert.ok(etag.length > 2, 'ETag must not be empty');
});

test('computeEmbedETag is stable for the same config', async () => {
  const { computeEmbedETag } = await import('./bundle.js');

  const etag1 = computeEmbedETag(FIXTURE_CONFIG);
  const etag2 = computeEmbedETag({ ...FIXTURE_CONFIG });
  assert.equal(etag1, etag2, 'same config must produce the same ETag');
});

test('computeEmbedETag changes when pixelId changes', async () => {
  const { computeEmbedETag } = await import('./bundle.js');

  const etag1 = computeEmbedETag(FIXTURE_CONFIG);
  const etag2 = computeEmbedETag({ ...FIXTURE_CONFIG, pixelId: '111111111111111' });
  assert.notEqual(etag1, etag2, 'different pixelId must produce a different ETag');
});

test('computeEmbedETag changes when messages change', async () => {
  const { computeEmbedETag } = await import('./bundle.js');

  const etag1 = computeEmbedETag(FIXTURE_CONFIG);
  const etag2 = computeEmbedETag({ ...FIXTURE_CONFIG, messages: ['Different message'] });
  assert.notEqual(etag1, etag2, 'different messages must produce a different ETag');
});

// ---------------------------------------------------------------------------
// renderEmbedBundle — config embedding
// ---------------------------------------------------------------------------

test('bundle contains landingId in CTA_CONFIG', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes(FIXTURE_CONFIG.landingId), 'bundle must contain the landingId');
});

test('bundle contains pixelId in CTA_CONFIG', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes(FIXTURE_CONFIG.pixelId), 'bundle must contain the pixelId');
});

test('bundle contains whatsapp messages in CTA_CONFIG', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes('Quiero crear un usuario'), 'bundle must contain a message substring');
});

test('bundle has CTA_CONFIG as a local variable (not window global)', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  // Must have local const CTA_CONFIG — NOT window.CTA_CONFIG or global assignment
  assert.ok(bundle.includes('CTA_CONFIG'), 'bundle must define CTA_CONFIG');
  assert.ok(
    !bundle.includes('window.CTA_CONFIG'),
    'CTA_CONFIG must NOT be assigned to window (no global pollution)',
  );
  // Must be inside an IIFE
  assert.ok(
    bundle.includes('(function') || bundle.includes('(function()') || bundle.includes('function ()'),
    'bundle must be wrapped in an IIFE',
  );
});

// ---------------------------------------------------------------------------
// CRITICAL: accessToken must never appear in the bundle
// ---------------------------------------------------------------------------

test('CRITICAL: bundle does not contain the string "accessToken"', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(
    !bundle.includes('accessToken'),
    'bundle must NEVER contain the string "accessToken"',
  );
});

test('CRITICAL: bundle does not contain the mock access token value', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  // Even if somehow a token value were injected, it must not appear in the output
  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(
    !bundle.includes(MOCK_ACCESS_TOKEN),
    'bundle must NEVER contain the access token value',
  );
});

// ---------------------------------------------------------------------------
// XSS: </script> in messages must be escaped
// ---------------------------------------------------------------------------

test('bundle escapes </script> in messages to prevent XSS breakout', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const xssConfig = {
    ...FIXTURE_CONFIG,
    messages: ['Safe</script><script>alert(1)</script>'],
  };
  const bundle = renderEmbedBundle(xssConfig);

  assert.ok(
    !bundle.includes('</script><script>'),
    'bundle must NOT contain unescaped </script> tag breakout',
  );
});

// ---------------------------------------------------------------------------
// De-branding: no "lemon" references in bundle
// ---------------------------------------------------------------------------

test('bundle does not contain "lemon" branding in identifiers', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG).toLowerCase();
  // Check for branded attribute names and identifiers
  assert.ok(!bundle.includes('data-lemon'), 'bundle must not use data-lemon-* attributes');
  assert.ok(!bundle.includes('lemon-cta'), 'bundle must not use lemon-cta identifiers');
  assert.ok(!bundle.includes('const lemon'), 'bundle must not define LEMON constant');
});

test('bundle uses neutral data-cta-* attributes', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes('data-cta-mode'), 'bundle must use data-cta-mode');
  assert.ok(bundle.includes('data-cta-captcha') || bundle.includes('data-cta-target'),
    'bundle must use neutral CTA attributes');
});

// ---------------------------------------------------------------------------
// 3-mode runtime branches
// ---------------------------------------------------------------------------

test('bundle contains solo-logica mode branch', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes("'solo-logica'") || bundle.includes('"solo-logica"'),
    'bundle must have solo-logica branch');
  assert.ok(bundle.includes('[data-cta]') || bundle.includes('ctaTarget'),
    'solo-logica must reference ctaTarget selector');
});

test('bundle contains widget-automontado mode branch with cta-root', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes("'widget-automontado'") || bundle.includes('"widget-automontado"'),
    'bundle must have widget-automontado branch');
  assert.ok(bundle.includes('cta-root'), 'widget-automontado must reference cta-root id');
});

test('bundle contains boton-flotante mode branch with FAB and modal', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes("'boton-flotante'") || bundle.includes('"boton-flotante"'),
    'bundle must have boton-flotante branch');
  assert.ok(bundle.includes('cta-fab'), 'boton-flotante must create FAB element');
  assert.ok(bundle.includes('cta-modal'), 'boton-flotante must create modal element');
});

// ---------------------------------------------------------------------------
// Altcha PoW solver — round-trip test
// ---------------------------------------------------------------------------

test('solveAltchaChallenge round-trip: create challenge → solve → verifyCaptcha accepts it', async () => {
  const { solveAltchaChallenge } = await import('./bundle.js');
  const { verifyCaptcha } = await import('../../integrations/altcha.js');

  const TEST_HMAC_KEY = process.env.ALTCHA_HMAC_SECRET!;

  // Create a tiny challenge (maxnumber=10) so solver completes in ~10 hash ops
  const challenge = await createChallenge({
    hmacKey: TEST_HMAC_KEY,
    maxnumber: 10,
    expires: new Date(Date.now() + 600_000),
  });

  // Solve using the exported solver (same logic embedded in the bundle)
  const payload = await solveAltchaChallenge(challenge);

  // Verify the payload is a valid base64 string
  assert.ok(typeof payload === 'string', 'solver must return a string');
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  assert.ok(typeof decoded.number === 'number', 'decoded payload must have a number field');
  assert.ok(decoded.number >= 0 && decoded.number <= 10, 'solved number must be in [0, maxnumber]');

  // Verify with verifyCaptcha using a mocked replayStore (no Redis needed)
  const result = await verifyCaptcha(payload, undefined, async () => true);
  assert.equal(result, true, 'verifyCaptcha must accept the solved payload');
});

test('solveAltchaChallenge throws when challenge cannot be solved (impossible number)', async () => {
  const { solveAltchaChallenge } = await import('./bundle.js');

  // A challenge whose answer is outside [0, maxnumber=0]
  const impossibleChallenge = {
    algorithm: 'SHA-256',
    challenge: 'a'.repeat(64), // Extremely unlikely to match any hash
    salt: 'testsalt&',
    signature: 'mocksig',
    maxnumber: 0, // Only try n=0
  };

  await assert.rejects(
    () => solveAltchaChallenge(impossibleChallenge),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes('solved') || (err as Error).message.includes('maxnumber'));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// RUNTIME_VERSION is exported
// ---------------------------------------------------------------------------

test('RUNTIME_VERSION is exported as a non-empty string', async () => {
  const { RUNTIME_VERSION } = await import('./bundle.js');

  assert.equal(typeof RUNTIME_VERSION, 'string', 'RUNTIME_VERSION must be a string');
  assert.ok(RUNTIME_VERSION.length > 0, 'RUNTIME_VERSION must not be empty');
});

test('bundle output contains RUNTIME_VERSION comment', async () => {
  const { renderEmbedBundle, RUNTIME_VERSION } = await import('./bundle.js');

  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes(RUNTIME_VERSION), 'bundle must reference RUNTIME_VERSION');
});

// ---------------------------------------------------------------------------
// Altcha challenge difficulty — createAltchaChallenge must return maxnumber = 50_000
// ---------------------------------------------------------------------------

test('createAltchaChallenge returns maxnumber=50000 for fast client pre-solve', async () => {
  const { createAltchaChallenge } = await import('../../integrations/altcha.js');

  const challenge = await createAltchaChallenge();
  assert.equal(
    challenge.maxnumber,
    50_000,
    'createAltchaChallenge must set maxnumber=50000 so client pre-solve completes in <1s',
  );
});

// ---------------------------------------------------------------------------
// RUNTIME_VERSION bump — pixel-init release
// ---------------------------------------------------------------------------

test('RUNTIME_VERSION is 1.2.0 (pixel-init bump invalidates ETags)', async () => {
  const { RUNTIME_VERSION } = await import('./bundle.js');
  assert.equal(RUNTIME_VERSION, '1.2.0', 'RUNTIME_VERSION must be bumped to 1.2.0 for pixel-init release');
});

// ---------------------------------------------------------------------------
// Idempotence guard present in bundle string
// ---------------------------------------------------------------------------

test('bundle contains idempotence guard __ctaEmbedInit', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes('__ctaEmbedInit'), 'bundle must contain the idempotence guard flag');
});

// ---------------------------------------------------------------------------
// Pixel bootstrap: fbevents.js URL present in bundle
// ---------------------------------------------------------------------------

test('bundle contains fbevents.js URL for pixel bootstrap', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(
    bundle.includes('fbevents.js'),
    'bundle must reference fbevents.js for pixel auto-init bootstrap',
  );
});

// ---------------------------------------------------------------------------
// trackSingle (not track) used in pixel-init
// ---------------------------------------------------------------------------

test('bundle uses trackSingle (not track) for pixel PageView — isolation from other pixels', async () => {
  const { renderEmbedBundle } = await import('./bundle.js');
  const bundle = renderEmbedBundle(FIXTURE_CONFIG);
  assert.ok(bundle.includes('trackSingle'), 'bundle must use trackSingle for pixel isolation');
});
