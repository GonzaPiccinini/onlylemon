import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversionSchema } from './cashier.types.js';

test('createConversionSchema rejects amounts lower than 3000', () => {
  const parsed = createConversionSchema.safeParse({ amount: 2999 });
  assert.equal(parsed.success, false);
});

test('createConversionSchema accepts amount equal to 3000', () => {
  const parsed = createConversionSchema.safeParse({ amount: 3000 });
  assert.equal(parsed.success, true);
});

test('createConversionSchema accepts amounts greater than 3000', () => {
  const parsed = createConversionSchema.safeParse({ amount: 7500 });
  assert.equal(parsed.success, true);
});
