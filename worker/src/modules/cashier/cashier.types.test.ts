import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertLeadSchema } from './cashier.types.js';

test('convertLeadSchema rejects amounts lower than 3000', () => {
  const parsed = convertLeadSchema.safeParse({ amount: 2999 });
  assert.equal(parsed.success, false);
});

test('convertLeadSchema accepts amount equal to 3000', () => {
  const parsed = convertLeadSchema.safeParse({ amount: 3000 });
  assert.equal(parsed.success, true);
});

test('convertLeadSchema accepts amounts greater than 3000', () => {
  const parsed = convertLeadSchema.safeParse({ amount: 7500 });
  assert.equal(parsed.success, true);
});
