/**
 * B10.5 — Audit script exits non-zero with offending IDs (REQ-7)
 *
 * The CLI script (`scripts/audit-landings-without-fallbacks.ts`) requires a real DB
 * and cannot be tested without one. The pure logic is factored out into
 * `src/scripts/audit-landings-without-fallbacks.ts` and tested here with a mock queryFn.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('B10.5: auditLandingsWithoutFallbacks returns ok:true when all landings have fallbacks', async () => {
  const { auditLandingsWithoutFallbacks } = await import('./audit-landings-without-fallbacks.js');

  // Mock: no offending landings
  const result = await auditLandingsWithoutFallbacks(async () => []);

  assert.deepEqual(result, { ok: true });
});

test('B10.5: auditLandingsWithoutFallbacks returns ok:false with violatingIds when landings lack fallbacks', async () => {
  const { auditLandingsWithoutFallbacks } = await import('./audit-landings-without-fallbacks.js');

  const offendingRows = [
    { id: 'landing-no-fallback-1', metaPixelId: 'pixel-1', url: 'https://lp1.example.com' },
    { id: 'landing-no-fallback-2', metaPixelId: 'pixel-2', url: 'https://lp2.example.com' },
  ];

  const result = await auditLandingsWithoutFallbacks(async () => offendingRows);

  assert.ok(result.ok === false, 'result must be ok:false');
  assert.ok(!result.ok);
  assert.deepEqual(result.violatingIds, ['landing-no-fallback-1', 'landing-no-fallback-2']);
  assert.deepEqual(result.rows, offendingRows);
});

test('B10.5: violatingIds contains the exact offending landing ID', async () => {
  const { auditLandingsWithoutFallbacks } = await import('./audit-landings-without-fallbacks.js');

  const offendingId = 'specific-landing-abc-123';
  const result = await auditLandingsWithoutFallbacks(async () => [
    { id: offendingId, metaPixelId: 'px-x', url: 'https://lp-x.example.com' },
  ]);

  assert.ok(!result.ok);
  assert.ok(!result.ok && result.violatingIds.includes(offendingId),
    `violatingIds should contain "${offendingId}"`);
});
