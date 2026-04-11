import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertLeadSchema } from './cashier.types.js';

test('convertLeadSchema rejects amounts lower than 2000', () => {
  const parsed = convertLeadSchema.safeParse({ amount: 1999 });
  assert.equal(parsed.success, false);
});

test('convertLeadSchema accepts amount equal to 2000', () => {
  const parsed = convertLeadSchema.safeParse({ amount: 2000 });
  assert.equal(parsed.success, true);
});

test('convertLeadSchema accepts amounts greater than 2000', () => {
  const parsed = convertLeadSchema.safeParse({ amount: 7500 });
  assert.equal(parsed.success, true);
});
