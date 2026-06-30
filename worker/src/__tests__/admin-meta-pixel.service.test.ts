/**
 * Task 3.1 — Admin MetaPixel service tests (STRICT TDD — RED first)
 *
 * Tests the injectable service impl functions for MetaPixel CRUD + guards.
 * All tests use mocked deps: no real DB required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Required env stubs (pattern from other admin tests)
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER = process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeMetaPixelPublicDto = (overrides: Record<string, unknown> = {}) => ({
  id: 'mp-1',
  pixelId: '976916338006290',
  label: 'Test Pixel',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

// ---------------------------------------------------------------------------
// createMetaPixelServiceImpl
// ---------------------------------------------------------------------------

test('createMetaPixelServiceImpl: creates pixel and response has no accessToken', async () => {
  const { createMetaPixelServiceImpl } = await import('../modules/admin/admin.service.js');

  const created = await createMetaPixelServiceImpl(
    {
      createMetaPixel: async (input) => makeMetaPixelPublicDto({ pixelId: input.pixelId, label: input.label }),
    },
    { pixelId: '976916338006290', accessToken: 'secret-token', label: 'Test Pixel' },
  );

  assert.equal(created.pixelId, '976916338006290');
  assert.equal(created.label, 'Test Pixel');
  // accessToken MUST NOT appear in the response
  assert.equal((created as Record<string, unknown>)['accessToken'], undefined);
});

test('createMetaPixelServiceImpl: creates pixel without label', async () => {
  const { createMetaPixelServiceImpl } = await import('../modules/admin/admin.service.js');

  const created = await createMetaPixelServiceImpl(
    {
      createMetaPixel: async (input) => makeMetaPixelPublicDto({ pixelId: input.pixelId, label: null }),
    },
    { pixelId: '111222333', accessToken: 'tok' },
  );

  assert.equal(created.pixelId, '111222333');
  assert.equal(created.label, null);
  assert.equal((created as Record<string, unknown>)['accessToken'], undefined);
});

// ---------------------------------------------------------------------------
// listMetaPixelsServiceImpl
// ---------------------------------------------------------------------------

test('listMetaPixelsServiceImpl: returns list without accessToken on any item', async () => {
  const { listMetaPixelsServiceImpl } = await import('../modules/admin/admin.service.js');

  const items = [
    makeMetaPixelPublicDto({ id: 'mp-1', pixelId: 'A' }),
    makeMetaPixelPublicDto({ id: 'mp-2', pixelId: 'B' }),
  ];

  const result = await listMetaPixelsServiceImpl({
    listMetaPixels: async () => items,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].pixelId, 'A');
  assert.equal(result[1].pixelId, 'B');
  // No accessToken on any item
  for (const item of result) {
    assert.equal((item as Record<string, unknown>)['accessToken'], undefined);
  }
});

// ---------------------------------------------------------------------------
// updateMetaPixelServiceImpl — pixelId guard (leads exist)
// ---------------------------------------------------------------------------

test('updateMetaPixelServiceImpl: pixelId edit BLOCKED when leads reference the pixel', async () => {
  const { updateMetaPixelServiceImpl, PixelIdFrozenError } = await import('../modules/admin/admin.service.js');

  const deps = {
    countMetaPixelLeads: async (_id: string) => 3, // 3 leads pinned
    updateMetaPixel: async () => makeMetaPixelPublicDto(),
  };

  await assert.rejects(
    () => updateMetaPixelServiceImpl(deps, 'mp-1', { pixelId: 'new-number' }),
    (err: unknown) => err instanceof PixelIdFrozenError,
  );
});

test('updateMetaPixelServiceImpl: pixelId edit ALLOWED when only landings reference (0 leads)', async () => {
  const { updateMetaPixelServiceImpl } = await import('../modules/admin/admin.service.js');

  const updated = makeMetaPixelPublicDto({ pixelId: 'new-number' });
  const deps = {
    countMetaPixelLeads: async (_id: string) => 0, // zero leads
    updateMetaPixel: async () => updated,
  };

  const result = await updateMetaPixelServiceImpl(deps, 'mp-1', { pixelId: 'new-number' });
  assert.equal(result.pixelId, 'new-number');
});

// ---------------------------------------------------------------------------
// updateMetaPixelServiceImpl — accessToken / label always editable
// ---------------------------------------------------------------------------

test('updateMetaPixelServiceImpl: accessToken update always succeeds (no lead guard applied)', async () => {
  const { updateMetaPixelServiceImpl } = await import('../modules/admin/admin.service.js');

  // Even with many leads, accessToken update should succeed
  let leadCountCalled = false;
  const deps = {
    countMetaPixelLeads: async (_id: string) => {
      leadCountCalled = true;
      return 99;
    },
    updateMetaPixel: async () => makeMetaPixelPublicDto(),
  };

  // Should NOT throw even when leads exist, because accessToken is not pixelId
  const result = await updateMetaPixelServiceImpl(deps, 'mp-1', { accessToken: 'new-secret' });
  assert.ok(result.id !== undefined);
  // Lead count check should NOT have been invoked for accessToken-only update
  assert.equal(leadCountCalled, false);
});

test('updateMetaPixelServiceImpl: label update always succeeds regardless of leads', async () => {
  const { updateMetaPixelServiceImpl } = await import('../modules/admin/admin.service.js');

  const deps = {
    countMetaPixelLeads: async () => 50,
    updateMetaPixel: async () => makeMetaPixelPublicDto({ label: 'New Label' }),
  };

  const result = await updateMetaPixelServiceImpl(deps, 'mp-1', { label: 'New Label' });
  assert.equal(result.label, 'New Label');
});

// ---------------------------------------------------------------------------
// deleteMetaPixelServiceImpl — delete blocked
// ---------------------------------------------------------------------------

test('deleteMetaPixelServiceImpl: delete BLOCKED when landing references pixel', async () => {
  const { deleteMetaPixelServiceImpl, MetaPixelRestrictError } = await import('../modules/admin/admin.service.js');

  const deps = {
    countMetaPixelLeads: async () => 0,
    countMetaPixelLandings: async () => 2, // 2 landings referencing
    deleteMetaPixel: async () => {},
  };

  await assert.rejects(
    () => deleteMetaPixelServiceImpl(deps, 'mp-1'),
    (err: unknown) => {
      assert.ok(err instanceof MetaPixelRestrictError);
      assert.equal(err.references.landings, 2);
      assert.equal(err.references.leads, 0);
      return true;
    },
  );
});

test('deleteMetaPixelServiceImpl: delete BLOCKED when lead references pixel', async () => {
  const { deleteMetaPixelServiceImpl, MetaPixelRestrictError } = await import('../modules/admin/admin.service.js');

  const deps = {
    countMetaPixelLeads: async () => 5,
    countMetaPixelLandings: async () => 1,
    deleteMetaPixel: async () => {},
  };

  await assert.rejects(
    () => deleteMetaPixelServiceImpl(deps, 'mp-1'),
    (err: unknown) => {
      assert.ok(err instanceof MetaPixelRestrictError);
      assert.equal(err.references.leads, 5);
      assert.equal(err.references.landings, 1);
      return true;
    },
  );
});

test('deleteMetaPixelServiceImpl: delete SUCCEEDS when unreferenced', async () => {
  const { deleteMetaPixelServiceImpl } = await import('../modules/admin/admin.service.js');

  let deleteCalled = false;
  const deps = {
    countMetaPixelLeads: async () => 0,
    countMetaPixelLandings: async () => 0,
    deleteMetaPixel: async (_id: string) => {
      deleteCalled = true;
    },
  };

  await assert.doesNotReject(() => deleteMetaPixelServiceImpl(deps, 'mp-1'));
  assert.equal(deleteCalled, true);
});

// ---------------------------------------------------------------------------
// Export surface checks
// ---------------------------------------------------------------------------

test('admin.service exports createMetaPixelService (real deps wired)', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.createMetaPixelService, 'function');
});

test('admin.service exports listMetaPixelsService (real deps wired)', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.listMetaPixelsService, 'function');
});

test('admin.service exports updateMetaPixelService (real deps wired)', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.updateMetaPixelService, 'function');
});

test('admin.service exports deleteMetaPixelService (real deps wired)', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.deleteMetaPixelService, 'function');
});

test('admin.service exports PixelIdFrozenError class', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.PixelIdFrozenError, 'function');
  const err = new mod.PixelIdFrozenError();
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'PixelIdFrozenError');
});

test('admin.service exports MetaPixelRestrictError class with references', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.MetaPixelRestrictError, 'function');
  const err = new mod.MetaPixelRestrictError({ leads: 3, landings: 1 });
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'MetaPixelRestrictError');
  assert.equal(err.references.leads, 3);
  assert.equal(err.references.landings, 1);
});

test('admin.service exports MetaPixelNotFoundError class', async () => {
  const mod = await import('../modules/admin/admin.service.js');
  assert.equal(typeof mod.MetaPixelNotFoundError, 'function');
  const err = new mod.MetaPixelNotFoundError();
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'MetaPixelNotFoundError');
});
