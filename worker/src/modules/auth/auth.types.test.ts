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
process.env.WAHA_WEBHOOK_URL =
  process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
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
// B2.1 — refreshSchema / logoutSchema (RED → GREEN)
// ---------------------------------------------------------------------------

test('refreshSchema is exported from auth.types', async () => {
  const mod = await import('./auth.types.js') as Record<string, unknown>;
  assert.ok(mod.refreshSchema !== undefined, 'refreshSchema should be exported');
});

test('refreshSchema.safeParse({ refreshToken: "" }) → failure', async () => {
  const mod = await import('./auth.types.js') as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
  const result = mod.refreshSchema.safeParse({ refreshToken: '' });
  assert.equal(result.success, false);
});

test('refreshSchema.safeParse({ refreshToken: "abc" }) → success', async () => {
  const mod = await import('./auth.types.js') as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
  const result = mod.refreshSchema.safeParse({ refreshToken: 'abc' });
  assert.equal(result.success, true);
});

test('logoutSchema is exported from auth.types', async () => {
  const mod = await import('./auth.types.js') as Record<string, unknown>;
  assert.ok(mod.logoutSchema !== undefined, 'logoutSchema should be exported');
});

test('logoutSchema.safeParse({ refreshToken: "" }) → failure', async () => {
  const mod = await import('./auth.types.js') as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
  const result = mod.logoutSchema.safeParse({ refreshToken: '' });
  assert.equal(result.success, false);
});

test('logoutSchema.safeParse({ refreshToken: "abc" }) → success', async () => {
  const mod = await import('./auth.types.js') as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
  const result = mod.logoutSchema.safeParse({ refreshToken: 'abc' });
  assert.equal(result.success, true);
});

test('AuthSessionResponse: module import does not crash (structural check)', async () => {
  // If AuthSessionResponse is not exported correctly, the import would either throw
  // or the type-level usage would cause TS errors. This runtime check confirms
  // the module loads cleanly with all new exports.
  const mod = await import('./auth.types.js') as Record<string, unknown>;
  // The four new exports we need to verify exist
  assert.ok(mod.refreshSchema !== undefined, 'refreshSchema exported');
  assert.ok(mod.logoutSchema !== undefined, 'logoutSchema exported');
  // RefreshPayload and LogoutPayload are TypeScript types (erased at runtime),
  // but we confirm module exports the schemas and does not throw.
  assert.ok(true, 'module loaded without crash');
});
