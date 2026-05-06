import { test } from 'node:test';
import assert from 'node:assert/strict';

test('leadsFilterSchema accepts single status and cashier values', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');

  const parsed = leadsFilterSchema.parse({
    status: 'CONTACTED',
    cashierId: 'cashier-123',
  });

  assert.deepEqual(parsed, {
    status: ['CONTACTED'],
    cashierId: ['cashier-123'],
  });
});

test('leadsFilterSchema accepts repeated query params as arrays', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');

  const parsed = leadsFilterSchema.parse({
    status: ['CONTACTED', 'EXPIRED'],
    cashierId: ['cashier-123', 'cashier-456'],
  });

  assert.deepEqual(parsed, {
    status: ['CONTACTED', 'EXPIRED'],
    cashierId: ['cashier-123', 'cashier-456'],
  });
});

test('leadsFilterSchema accepts comma separated query params', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');

  const parsed = leadsFilterSchema.parse({
    status: 'CONTACTED,EXPIRED',
    cashierId: 'cashier-123,cashier-456',
    adCode: 'camp',
  });

  assert.deepEqual(parsed, {
    status: ['CONTACTED', 'EXPIRED'],
    cashierId: ['cashier-123', 'cashier-456'],
    adCode: 'camp',
  });
});
