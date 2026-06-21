import { test } from 'node:test';
import assert from 'node:assert/strict';

import { memoizeAsync } from './memoize-async.js';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('runs the factory only once across concurrent callers', async () => {
  let calls = 0;
  const get = memoizeAsync(async () => {
    calls += 1;
    await tick();
    return calls;
  });

  const [a, b, c] = await Promise.all([get(), get(), get()]);

  assert.equal(calls, 1, 'factory must run exactly once for a concurrent burst');
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(c, 1);
});

test('caches the resolved value for later callers', async () => {
  let calls = 0;
  const get = memoizeAsync(async () => {
    calls += 1;
    return calls;
  });

  const first = await get();
  const second = await get();

  assert.equal(calls, 1);
  assert.equal(first, 1);
  assert.equal(second, 1);
});

test('does not cache a rejection — a later call retries', async () => {
  let calls = 0;
  const get = memoizeAsync(async () => {
    calls += 1;
    if (calls === 1) throw new Error('boom');
    return 'ok';
  });

  await assert.rejects(() => get(), /boom/);
  const result = await get();

  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('concurrent callers during a failing init share one run, then a later call retries', async () => {
  let calls = 0;
  const get = memoizeAsync(async () => {
    calls += 1;
    await tick();
    if (calls === 1) throw new Error('init failed');
    return 'recovered';
  });

  const settled = await Promise.allSettled([get(), get()]);

  assert.equal(settled[0].status, 'rejected');
  assert.equal(settled[1].status, 'rejected');
  assert.equal(calls, 1, 'both concurrent callers shared a single failing init');

  const result = await get();
  assert.equal(result, 'recovered');
  assert.equal(calls, 2);
});
