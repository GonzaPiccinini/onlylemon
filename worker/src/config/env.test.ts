import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Env-setup block: set all required vars before any module is imported.
// IMPORTANT: We import the raw Zod schema (not the live `config` export)
// to avoid the startup-throw side effect from env validation.
// ---------------------------------------------------------------------------

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
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
// Set a valid JWT_REFRESH_SECRET as default for all tests
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012'; // 32 chars

// ---------------------------------------------------------------------------
// Helper to build a base-valid env object for schema parsing
// ---------------------------------------------------------------------------
const baseEnv = () => ({
  PORT: '3002',
  LEADS_CODE_TTL_HOURS: '24',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test?schema=public',
  BULLMQ_REDIS_URL: 'redis://localhost:6379',
  BULLMQ_QUEUE_NAME: 'test-queue',
  WORKER_CONCURRENCY: '1',
  WAHA_API_KEY: 'waha-key',
  WAHA_BASE_URL: 'http://localhost:3000',
  WAHA_WEBHOOK_URL: 'http://localhost:3002/webhook',
  WAHA_WEBHOOK_EVENTS: 'message',
  WAHA_WEBHOOK_TOKEN_HEADER: 'x-webhook-token',
  WAHA_WEBHOOK_TOKEN_VALUE: 'token',
  JWT_SECRET: '1234567890123456',
  CORS_ORIGIN: '*',
  META_API_VERSION: 'v21.0',
  JWT_REFRESH_SECRET: '12345678901234567890123456789012', // 32 chars — valid default
});

// ---------------------------------------------------------------------------
// JWT_REFRESH_SECRET tests
// ---------------------------------------------------------------------------

test('JWT_REFRESH_SECRET absent → schema parse throws', async () => {
  const { envSchema } = await import('./env.js');
  const env = baseEnv();
  delete (env as Record<string, unknown>).JWT_REFRESH_SECRET;
  const result = envSchema.safeParse(env);
  assert.equal(result.success, false, 'Expected parse to fail when JWT_REFRESH_SECRET is absent');
});

test('JWT_REFRESH_SECRET with 31 chars → schema parse throws', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_REFRESH_SECRET: '1234567890123456789012345678901' }; // 31 chars
  const result = envSchema.safeParse(env);
  assert.equal(result.success, false, 'Expected parse to fail when JWT_REFRESH_SECRET is 31 chars');
});

test('JWT_REFRESH_SECRET with 32 chars → schema parse succeeds', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_REFRESH_SECRET: '12345678901234567890123456789012' }; // 32 chars
  const result = envSchema.safeParse(env);
  assert.equal(result.success, true, `Expected parse to succeed with 32-char secret. Errors: ${JSON.stringify(result.error?.issues)}`);
});

// ---------------------------------------------------------------------------
// JWT_ACCESS_EXPIRES tests
// ---------------------------------------------------------------------------

test('JWT_ACCESS_EXPIRES="4m" → parse throws (below 5m floor)', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_ACCESS_EXPIRES: '4m' };
  const result = envSchema.safeParse(env);
  assert.equal(result.success, false, 'Expected parse to fail with JWT_ACCESS_EXPIRES=4m (below 5m)');
});

test('JWT_ACCESS_EXPIRES="31d" → parse throws (above 30d ceiling)', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_ACCESS_EXPIRES: '31d' };
  const result = envSchema.safeParse(env);
  assert.equal(result.success, false, 'Expected parse to fail with JWT_ACCESS_EXPIRES=31d (above 30d)');
});

test('JWT_ACCESS_EXPIRES="7d" → parse succeeds', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_ACCESS_EXPIRES: '7d' };
  const result = envSchema.safeParse(env);
  assert.equal(result.success, true, `Expected parse to succeed with JWT_ACCESS_EXPIRES=7d. Errors: ${JSON.stringify(result.error?.issues)}`);
});

test('JWT_ACCESS_EXPIRES absent → defaults to "7d"', async () => {
  const { envSchema } = await import('./env.js');
  const env = baseEnv();
  delete (env as Record<string, unknown>).JWT_ACCESS_EXPIRES;
  const result = envSchema.safeParse(env);
  assert.equal(result.success, true, `Expected parse to succeed with no JWT_ACCESS_EXPIRES. Errors: ${JSON.stringify(result.error?.issues)}`);
  assert.equal(result.data?.JWT_ACCESS_EXPIRES, '7d');
});

// ---------------------------------------------------------------------------
// JWT_REFRESH_EXPIRES_DAYS tests
// ---------------------------------------------------------------------------

test('JWT_REFRESH_EXPIRES_DAYS=0 → parse throws', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_REFRESH_EXPIRES_DAYS: '0' };
  const result = envSchema.safeParse(env);
  assert.equal(result.success, false, 'Expected parse to fail with JWT_REFRESH_EXPIRES_DAYS=0');
});

test('JWT_REFRESH_EXPIRES_DAYS=91 → parse throws', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_REFRESH_EXPIRES_DAYS: '91' };
  const result = envSchema.safeParse(env);
  assert.equal(result.success, false, 'Expected parse to fail with JWT_REFRESH_EXPIRES_DAYS=91');
});

test('JWT_REFRESH_EXPIRES_DAYS=30 → parse succeeds', async () => {
  const { envSchema } = await import('./env.js');
  const env = { ...baseEnv(), JWT_REFRESH_EXPIRES_DAYS: '30' };
  const result = envSchema.safeParse(env);
  assert.equal(result.success, true, `Expected parse to succeed with JWT_REFRESH_EXPIRES_DAYS=30. Errors: ${JSON.stringify(result.error?.issues)}`);
});

test('JWT_REFRESH_EXPIRES_DAYS absent → defaults to 30', async () => {
  const { envSchema } = await import('./env.js');
  const env = baseEnv();
  delete (env as Record<string, unknown>).JWT_REFRESH_EXPIRES_DAYS;
  const result = envSchema.safeParse(env);
  assert.equal(result.success, true, `Expected parse to succeed with no JWT_REFRESH_EXPIRES_DAYS. Errors: ${JSON.stringify(result.error?.issues)}`);
  assert.equal(result.data?.JWT_REFRESH_EXPIRES_DAYS, 30);
});
