import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// leads-filter-recarga — B1: leadsFilterSchema Zod tests
// ---------------------------------------------------------------------------

// B1.1 — RECARGA is a valid status value
test('leadsFilterSchema: accepts statuses = ["RECARGA"]', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['RECARGA'] });
  assert.equal(result.success, true, 'Expected RECARGA to be accepted but got validation error');
});

// B1.2 — Unknown status values must be rejected
test('leadsFilterSchema: rejects statuses = ["SOMETHING_ELSE"]', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['SOMETHING_ELSE'] });
  assert.equal(result.success, false, 'Expected SOMETHING_ELSE to be rejected but it was accepted');
});

// Triangulation: existing valid statuses still work after extension
test('leadsFilterSchema: still accepts original statuses [NOT_CONTACTED, CONTACTED, CONVERTED]', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['NOT_CONTACTED', 'CONTACTED', 'CONVERTED'] });
  assert.equal(result.success, true, 'Original statuses should still be accepted');
});

// Triangulation: mixed RECARGA with existing statuses
test('leadsFilterSchema: accepts mixed statuses including RECARGA', async () => {
  const { leadsFilterSchema } = await import('./admin.types.js');
  const result = leadsFilterSchema.safeParse({ statuses: ['CONVERTED', 'RECARGA'] });
  assert.equal(result.success, true, 'Mixed CONVERTED + RECARGA should be accepted');
});
