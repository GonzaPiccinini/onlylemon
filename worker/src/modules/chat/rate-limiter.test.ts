/**
 * rate-limiter.test.ts
 *
 * Tests for the per-session token-bucket rate limiter.
 * Written FIRST (RED) before implementation exists.
 *
 * Rate-limiter spec (from design §6):
 *   capacity: 10 tokens (burst)
 *   refill:   1 token per 500ms (≈ 2 tokens/sec sustained)
 *   scope:    per sessionId (independent buckets)
 *
 * Clock is injectable (nowFn param) so tests control time deterministically.
 * No real timers are used.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRateLimiter } from './rate-limiter.js';

describe('rate-limiter — basic consumption', () => {
  it('allows capacity consecutive consumes from a fresh bucket', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 10, refillIntervalMs: 500, nowFn: () => now });

    for (let i = 0; i < 10; i++) {
      assert.equal(limiter.tryConsume('session-1'), true, `consume #${i + 1} should succeed`);
    }
  });

  it('blocks the (capacity + 1)th consecutive consume', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 10, refillIntervalMs: 500, nowFn: () => now });

    for (let i = 0; i < 10; i++) {
      limiter.tryConsume('session-1');
    }

    assert.equal(limiter.tryConsume('session-1'), false, 'should be blocked after burst exhausted');
  });

  it('returns false when bucket is empty', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 3, refillIntervalMs: 500, nowFn: () => now });

    limiter.tryConsume('s');
    limiter.tryConsume('s');
    limiter.tryConsume('s');

    assert.equal(limiter.tryConsume('s'), false);
  });
});

describe('rate-limiter — token refill', () => {
  it('refills 1 token after refillIntervalMs elapses', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 5, refillIntervalMs: 500, nowFn: () => now });

    // drain all 5 tokens
    for (let i = 0; i < 5; i++) limiter.tryConsume('s');
    assert.equal(limiter.tryConsume('s'), false);

    // advance time by exactly 1 refill interval
    now = 500;
    assert.equal(limiter.tryConsume('s'), true, 'should get 1 refilled token');
    assert.equal(limiter.tryConsume('s'), false, 'no more tokens until next refill');
  });

  it('refills multiple tokens when multiple intervals elapse', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 10, refillIntervalMs: 500, nowFn: () => now });

    // drain all 10
    for (let i = 0; i < 10; i++) limiter.tryConsume('s');

    // advance time by 3 intervals → 3 tokens refilled
    now = 1500;
    assert.equal(limiter.tryConsume('s'), true);
    assert.equal(limiter.tryConsume('s'), true);
    assert.equal(limiter.tryConsume('s'), true);
    assert.equal(limiter.tryConsume('s'), false, 'only 3 tokens should have been refilled');
  });

  it('tokens never exceed capacity after long idle', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 5, refillIntervalMs: 500, nowFn: () => now });

    // drain all
    for (let i = 0; i < 5; i++) limiter.tryConsume('s');

    // advance 100 intervals — would produce 100 tokens but cap is 5
    now = 50_000;
    for (let i = 0; i < 5; i++) {
      assert.equal(limiter.tryConsume('s'), true, `consume #${i + 1} after long idle should succeed`);
    }
    assert.equal(limiter.tryConsume('s'), false, 'bucket capped at capacity — no overflow');
  });
});

describe('rate-limiter — session isolation', () => {
  it('separate sessionIds have independent buckets', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 2, refillIntervalMs: 500, nowFn: () => now });

    // drain session-A
    limiter.tryConsume('session-A');
    limiter.tryConsume('session-A');

    // session-B should still have a full bucket
    assert.equal(limiter.tryConsume('session-B'), true);
    assert.equal(limiter.tryConsume('session-B'), true);
    assert.equal(limiter.tryConsume('session-B'), false);

    // session-A is still empty
    assert.equal(limiter.tryConsume('session-A'), false);
  });

  it('refill for one session does not affect another', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 3, refillIntervalMs: 500, nowFn: () => now });

    // drain both
    for (let i = 0; i < 3; i++) limiter.tryConsume('A');
    for (let i = 0; i < 3; i++) limiter.tryConsume('B');

    // advance 1 interval
    now = 500;

    // both should get 1 token back independently
    assert.equal(limiter.tryConsume('A'), true);
    assert.equal(limiter.tryConsume('B'), true);
    assert.equal(limiter.tryConsume('A'), false);
    assert.equal(limiter.tryConsume('B'), false);
  });
});

describe('rate-limiter — default options', () => {
  it('uses default capacity=10 and refillIntervalMs=500 when no options provided', () => {
    let now = 0;
    const limiter = createRateLimiter({ nowFn: () => now });

    // should allow 10 consumes
    for (let i = 0; i < 10; i++) {
      assert.equal(limiter.tryConsume('s'), true);
    }
    assert.equal(limiter.tryConsume('s'), false);

    // advance 500ms → 1 refill
    now = 500;
    assert.equal(limiter.tryConsume('s'), true);
    assert.equal(limiter.tryConsume('s'), false);
  });
});
