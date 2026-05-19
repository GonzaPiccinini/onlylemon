/**
 * auto-conversion/budget.test.ts
 *
 * Tests for the Redis OCR-budget counter.
 * Uses a mock Redis client injected via the createBudgetChecker factory.
 * No real Redis connection is opened.
 *
 * TDD cycle: written BEFORE budget.ts exists (RED), then green once implemented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal env stubs
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
// Imports
// ---------------------------------------------------------------------------

import { BudgetExceededError } from './errors.js';
import { createBudgetChecker } from './budget.js';

// ---------------------------------------------------------------------------
// Mock Redis client
// ---------------------------------------------------------------------------

type MockRedisClient = {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
};

function makeMockRedis(options: {
  incrValues?: Record<string, number[]>;
  onIncr?: (key: string) => void;
  onExpire?: (key: string, seconds: number) => void;
  throwOnIncr?: Error;
}): MockRedisClient & { expireCalls: Array<[string, number]>; incrCalls: string[] } {
  const counters: Record<string, number> = {};
  const incrValues = options.incrValues ?? {};
  const expireCalls: Array<[string, number]> = [];
  const incrCalls: string[] = [];

  return {
    expireCalls,
    incrCalls,
    incr: async (key: string) => {
      if (options.throwOnIncr) throw options.throwOnIncr;
      incrCalls.push(key);
      options.onIncr?.(key);
      if (incrValues[key] && incrValues[key].length > 0) {
        return incrValues[key].shift()!;
      }
      counters[key] = (counters[key] ?? 0) + 1;
      return counters[key];
    },
    expire: async (key: string, seconds: number) => {
      expireCalls.push([key, seconds]);
      options.onExpire?.(key, seconds);
      return 1;
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: fixed UTC date for deterministic keys
// ---------------------------------------------------------------------------

const FIXED_DATE = new Date('2026-05-17T12:00:00.000Z');
const FIXED_DATE_KEY = '2026-05-17'; // UTC YYYY-MM-DD

// ---------------------------------------------------------------------------
// Key format tests
// ---------------------------------------------------------------------------

test('checkAndIncrement: uses key format ocr_calls:{cashierId}:{YYYY-MM-DD}', async () => {
  const redis = makeMockRedis({});
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  await checker.checkAndIncrement('cashier-1');

  assert.ok(redis.incrCalls.length === 1);
  assert.equal(redis.incrCalls[0], `ocr_calls:cashier-1:${FIXED_DATE_KEY}`);
});

test('checkAndIncrement: uses UTC date in key (not local date)', async () => {
  // Use a date that is in different days depending on timezone (UTC midnight)
  const utcMidnight = new Date('2026-05-18T00:30:00.000Z'); // UTC: 2026-05-18
  const redis = makeMockRedis({});
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => utcMidnight });

  await checker.checkAndIncrement('cashier-1');

  assert.equal(redis.incrCalls[0], 'ocr_calls:cashier-1:2026-05-18');
});

// ---------------------------------------------------------------------------
// First call of the day: INCR returns 1 → EXPIRE must be called
// ---------------------------------------------------------------------------

test('checkAndIncrement: first call (INCR=1) sets EXPIRE 86400', async () => {
  const key = `ocr_calls:cashier-1:${FIXED_DATE_KEY}`;
  const redis = makeMockRedis({ incrValues: { [key]: [1] } });
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  await checker.checkAndIncrement('cashier-1');

  assert.equal(redis.expireCalls.length, 1);
  assert.equal(redis.expireCalls[0][0], key);
  assert.equal(redis.expireCalls[0][1], 86400);
});

// ---------------------------------------------------------------------------
// Subsequent calls: INCR > 1 → EXPIRE must NOT be called
// ---------------------------------------------------------------------------

test('checkAndIncrement: subsequent call (INCR=2) does NOT call EXPIRE', async () => {
  const key = `ocr_calls:cashier-1:${FIXED_DATE_KEY}`;
  const redis = makeMockRedis({ incrValues: { [key]: [2] } });
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  await checker.checkAndIncrement('cashier-1');

  assert.equal(redis.expireCalls.length, 0);
});

test('checkAndIncrement: subsequent call (INCR=50) does NOT call EXPIRE', async () => {
  const key = `ocr_calls:cashier-1:${FIXED_DATE_KEY}`;
  const redis = makeMockRedis({ incrValues: { [key]: [50] } });
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  await checker.checkAndIncrement('cashier-1');

  assert.equal(redis.expireCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Budget exceeded: INCR > dailyLimit → throws BudgetExceededError
// ---------------------------------------------------------------------------

test('checkAndIncrement: INCR result > dailyLimit (100) → throws BudgetExceededError', async () => {
  const key = `ocr_calls:cashier-1:${FIXED_DATE_KEY}`;
  const redis = makeMockRedis({ incrValues: { [key]: [101] } });
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  await assert.rejects(
    () => checker.checkAndIncrement('cashier-1'),
    (err: unknown) => {
      assert.ok(err instanceof BudgetExceededError);
      return true;
    },
  );
});

test('checkAndIncrement: INCR result exactly at dailyLimit (100) → does NOT throw', async () => {
  const key = `ocr_calls:cashier-1:${FIXED_DATE_KEY}`;
  const redis = makeMockRedis({ incrValues: { [key]: [100] } });
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  // Should resolve without throwing
  await assert.doesNotReject(() => checker.checkAndIncrement('cashier-1'));
});

test('checkAndIncrement: custom dailyLimit respected (e.g. limit=5, INCR=6 → throws)', async () => {
  const key = `ocr_calls:cashier-1:${FIXED_DATE_KEY}`;
  const redis = makeMockRedis({ incrValues: { [key]: [6] } });
  const checker = createBudgetChecker(redis, { dailyLimit: 5, now: () => FIXED_DATE });

  await assert.rejects(
    () => checker.checkAndIncrement('cashier-1'),
    (err: unknown) => {
      assert.ok(err instanceof BudgetExceededError);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Redis error bubbles up
// ---------------------------------------------------------------------------

test('checkAndIncrement: Redis INCR throws → error bubbles up (not swallowed)', async () => {
  const redisError = new Error('Redis connection lost');
  const redis = makeMockRedis({ throwOnIncr: redisError });
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  await assert.rejects(
    () => checker.checkAndIncrement('cashier-1'),
    (err: unknown) => {
      assert.ok(err === redisError);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Isolation: different cashiers use different keys
// ---------------------------------------------------------------------------

test('checkAndIncrement: different cashierIds use different Redis keys', async () => {
  const redis = makeMockRedis({});
  const checker = createBudgetChecker(redis, { dailyLimit: 100, now: () => FIXED_DATE });

  await checker.checkAndIncrement('cashier-A');
  await checker.checkAndIncrement('cashier-B');

  assert.equal(redis.incrCalls.length, 2);
  assert.notEqual(redis.incrCalls[0], redis.incrCalls[1]);
  assert.ok(redis.incrCalls[0].includes('cashier-A'));
  assert.ok(redis.incrCalls[1].includes('cashier-B'));
});

// ---------------------------------------------------------------------------
// Export surface — structural check (RED until budget.ts is created)
// ---------------------------------------------------------------------------

test('budget module exports createBudgetChecker function', async () => {
  const mod = await import('./budget.js');
  assert.equal(typeof mod.createBudgetChecker, 'function');
});
