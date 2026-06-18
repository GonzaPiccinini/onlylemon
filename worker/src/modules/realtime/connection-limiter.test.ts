import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createConnectionLimiter } from './connection-limiter.js';

describe('connection-limiter', () => {
  it('allows up to maxPerKey concurrent connections, then refuses', () => {
    const limiter = createConnectionLimiter(3);

    assert.equal(limiter.tryAcquire('user-1'), true);
    assert.equal(limiter.tryAcquire('user-1'), true);
    assert.equal(limiter.tryAcquire('user-1'), true);
    assert.equal(limiter.tryAcquire('user-1'), false, '4th connection over the cap is refused');
  });

  it('release frees a slot so a new connection can be acquired', () => {
    const limiter = createConnectionLimiter(2);

    limiter.tryAcquire('user-1');
    limiter.tryAcquire('user-1');
    assert.equal(limiter.tryAcquire('user-1'), false);

    limiter.release('user-1');
    assert.equal(limiter.tryAcquire('user-1'), true, 'a freed slot is reusable');
  });

  it('count reflects acquisitions and releases', () => {
    const limiter = createConnectionLimiter(5);

    assert.equal(limiter.count('user-1'), 0);
    limiter.tryAcquire('user-1');
    limiter.tryAcquire('user-1');
    assert.equal(limiter.count('user-1'), 2);
    limiter.release('user-1');
    assert.equal(limiter.count('user-1'), 1);
  });

  it('keys are independent', () => {
    const limiter = createConnectionLimiter(1);

    assert.equal(limiter.tryAcquire('user-1'), true);
    assert.equal(limiter.tryAcquire('user-2'), true, 'a different user has their own budget');
    assert.equal(limiter.tryAcquire('user-1'), false);
  });

  it('releasing below zero is a no-op (count never goes negative)', () => {
    const limiter = createConnectionLimiter(2);

    limiter.release('ghost');
    limiter.release('ghost');
    assert.equal(limiter.count('ghost'), 0);
    assert.equal(limiter.tryAcquire('ghost'), true);
  });

  it('drops the key from memory once it returns to zero', () => {
    const limiter = createConnectionLimiter(2);

    limiter.tryAcquire('user-1');
    limiter.release('user-1');
    // Back to zero → no lingering entry (bounds memory like the rate-limiter eviction).
    assert.equal(limiter.size(), 0);
  });
});
