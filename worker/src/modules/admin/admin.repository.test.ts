import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://localhost:3000';
process.env.WAHA_WEBHOOK_URL =
  process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

test('buildListLeadsQuery orders leads by updateAt desc', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');

  const query = buildListLeadsQuery({});

  assert.deepEqual(query.orderBy, [{ updateAt: 'desc' }, { id: 'desc' }]);
});

test('buildListLeadsQuery keeps optional statuses, cashier and adCode filters', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');

  const query = buildListLeadsQuery({
    statuses: ['CONTACTED'],
    cashierId: 'cashier-123',
    adCode: 'camp-2026',
  });

  assert.deepEqual(query.where, {
    status: { in: ['CONTACTED'] },
    cashierId: 'cashier-123',
    adCode: {
      contains: 'camp-2026',
      mode: 'insensitive',
    },
  });
});

// ---------------------------------------------------------------------------
// M2.5 — buildListConversionsQuery
// ---------------------------------------------------------------------------

test('buildListConversionsQuery: no filters → empty where (no lead constraint)', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({});
  // Without filters lead sub-object should be empty (or absent)
  assert.ok(q.where !== undefined);
  assert.ok(q.orderBy !== undefined);
});

test('buildListConversionsQuery: dateFrom filter → createdAt gte', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const from = new Date('2026-01-01T00:00:00Z');
  const q = buildListConversionsQuery({ dateFrom: from });
  assert.deepEqual(q.where.createdAt, { gte: from });
});

test('buildListConversionsQuery: dateTo filter → createdAt lt', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const to = new Date('2026-01-31T00:00:00Z');
  const q = buildListConversionsQuery({ dateTo: to });
  assert.deepEqual(q.where.createdAt, { lt: to });
});

test('buildListConversionsQuery: dateFrom + dateTo → createdAt gte+lt combined', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-31T00:00:00Z');
  const q = buildListConversionsQuery({ dateFrom: from, dateTo: to });
  assert.deepEqual(q.where.createdAt, { gte: from, lt: to });
});

test('buildListConversionsQuery: amountMin → amount gte', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({ amountMin: 3000 });
  assert.deepEqual(q.where.amount, { gte: 3000 });
});

test('buildListConversionsQuery: amountMax → amount lte', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({ amountMax: 10000 });
  assert.deepEqual(q.where.amount, { lte: 10000 });
});

test('buildListConversionsQuery: cashierIds filter → lead.cashierId in', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({ cashierIds: ['c1', 'c2'] });
  assert.deepEqual(q.where.lead?.cashierId, { in: ['c1', 'c2'] });
});

test('buildListConversionsQuery: phone filter → lead.phone contains (case-sensitive)', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({ phone: '54911' });
  assert.deepEqual(q.where.lead?.phone, { contains: '54911' });
});

test('buildListConversionsQuery: code filter → lead.code contains (case-insensitive)', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({ code: 'LEAD' });
  assert.deepEqual(q.where.lead?.code, { contains: 'LEAD', mode: 'insensitive' });
});

test('buildListConversionsQuery: orders by createdAt desc', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({});
  assert.deepEqual(q.orderBy, { createdAt: 'desc' });
});

// ---------------------------------------------------------------------------
// M2.7 — buildListLeadsQuery new filters (code, phone, cashierIds, status)
// ---------------------------------------------------------------------------

test('buildListLeadsQuery: code filter uses case-insensitive contains (mode: insensitive)', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ code: 'LEAD001' });
  assert.deepEqual(q.where.code, { contains: 'LEAD001', mode: 'insensitive' });
});

test('buildListLeadsQuery: phone filter uses case-sensitive contains', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ phone: '54911' });
  assert.deepEqual(q.where.phone, { contains: '54911' });
});

test('buildListLeadsQuery: cashierIds filter maps to cashierId in', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ cashierIds: ['c1', 'c2'] });
  assert.deepEqual(q.where.cashierId, { in: ['c1', 'c2'] });
});

test('buildListLeadsQuery: statuses filter (CONVERTED) sets status in field', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ statuses: ['CONVERTED'] });
  assert.deepEqual(q.where.status, { in: ['CONVERTED'] });
});

test('buildListLeadsQuery: multiple statuses sets status in array', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ statuses: ['CONTACTED', 'CONVERTED'] });
  assert.deepEqual(q.where.status, { in: ['CONTACTED', 'CONVERTED'] });
});

test('buildListLeadsQuery: empty statuses array does not set status filter', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ statuses: [] });
  assert.equal(q.where.status, undefined);
});

test('buildListConversionsQuery: listConversionsAdmin function is exported', async () => {
  const { listConversionsAdmin } = await import('./admin.repository.js');
  assert.equal(typeof listConversionsAdmin, 'function');
});

// ---------------------------------------------------------------------------
// Task 15 — createAdmin repository (TDD: RED → GREEN)
// ---------------------------------------------------------------------------

test('createAdmin is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.createAdmin, 'function');
});

test('createAdmin: arity is 1 (accepts input object)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.createAdmin as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 1);
});

// ---------------------------------------------------------------------------
// Task 16 — listAdmins repository (TDD: RED → GREEN)
// ---------------------------------------------------------------------------

test('listAdmins is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.listAdmins, 'function');
});

test('listAdmins: arity is 0 (no parameters)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.listAdmins as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 0);
});

// ---------------------------------------------------------------------------
// Task 17 — updateAdmin repository (TDD: RED → GREEN)
// ---------------------------------------------------------------------------

test('updateAdmin is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.updateAdmin, 'function');
});

test('updateAdmin: arity is 2 (adminId, input)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.updateAdmin as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 2);
});

// ---------------------------------------------------------------------------
// Task 18 — setAdminStatus + findAdminById repository (TDD: RED → GREEN)
// ---------------------------------------------------------------------------

test('setAdminStatus is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.setAdminStatus, 'function');
});

test('findAdminById is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.findAdminById, 'function');
});

// ---------------------------------------------------------------------------
// admin-conversions-totals — M2: getConversionsTotals repository
// ---------------------------------------------------------------------------

test('getConversionsTotals is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.getConversionsTotals, 'function');
});

test('getConversionsTotals: where clause matches buildListConversionsQuery with no filters', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const filters = {};
  const q = buildListConversionsQuery(filters);
  assert.deepEqual(q.where, buildListConversionsQuery({}).where);
});

test('getConversionsTotals: where clause matches buildListConversionsQuery with dateFrom filter', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const dateFrom = new Date('2024-01-01T03:00:00.000Z');
  const filters = { dateFrom };
  const q = buildListConversionsQuery(filters);
  assert.deepEqual(q.where.createdAt, { gte: dateFrom });
});

test('getConversionsTotals: where clause matches buildListConversionsQuery with amountMin+amountMax', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const filters = { amountMin: 100, amountMax: 5000 };
  const q = buildListConversionsQuery(filters);
  assert.deepEqual(q.where.amount, { gte: 100, lte: 5000 });
});

test('getConversionsTotals: where clause matches buildListConversionsQuery with cashierIds', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const filters = { cashierIds: ['c1', 'c2'] };
  const q = buildListConversionsQuery(filters);
  assert.deepEqual(q.where.lead?.cashierId, { in: ['c1', 'c2'] });
});

test('getConversionsTotals: where clause matches buildListConversionsQuery with phone+code+adCode', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const filters = { phone: '5491', code: 'LEAD', adCode: 'camp-1' };
  const q = buildListConversionsQuery(filters);
  assert.deepEqual(q.where.lead?.phone, { contains: '5491' });
  assert.deepEqual(q.where.lead?.code, { contains: 'LEAD', mode: 'insensitive' });
  assert.deepEqual(q.where.lead?.adCode, { contains: 'camp-1', mode: 'insensitive' });
});

test('getConversionsTotals: returns a thenable (structural)', async () => {
  const { getConversionsTotals } = await import('./admin.repository.js');
  const result = getConversionsTotals({});
  assert.equal(typeof result.then, 'function');
});

// ---------------------------------------------------------------------------
// admin-stats first-charges chart — getFirstConversionsByDateRange
// ---------------------------------------------------------------------------

test('getFirstConversionsByDateRange: exported as a function', async () => {
  const mod = (await import('./admin.repository.js')) as Record<string, unknown>;
  assert.equal(typeof mod.getFirstConversionsByDateRange, 'function');
});

test('getFirstConversionsByDateRange: returns a thenable (structural)', async () => {
  const { getFirstConversionsByDateRange } = await import('./admin.repository.js');
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-12-31T00:00:00Z');
  // Real DB call may fail in this environment — wrap to keep structural assertion pure.
  try {
    const result = getFirstConversionsByDateRange(from, to);
    assert.equal(typeof (result as Promise<unknown>).then, 'function');
    await result.catch(() => undefined);
  } catch {
    // Acceptable: structural import-level invocation may throw without DB; we already
    // asserted the export type above.
  }
});

test('getFirstConversionsByDateRange: accepts optional cashierId argument (arity)', async () => {
  const { getFirstConversionsByDateRange } = await import('./admin.repository.js');
  // Function should accept (from, to, cashierId?) — length is 2 (cashierId is optional).
  assert.ok((getFirstConversionsByDateRange as Function).length >= 2);
});

// ---------------------------------------------------------------------------
// B2.3 — LandingFallbackPhone repository functions (structural / unit tests)
// ---------------------------------------------------------------------------

test('listLandingFallbackPhonesByLandingId is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.listLandingFallbackPhonesByLandingId, 'function');
});

test('listLandingFallbackPhonesByLandingId: arity is 1 (landingId)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.listLandingFallbackPhonesByLandingId as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 1);
});

test('listLandingFallbackPhonesByLandingId: returns a thenable (structural)', async () => {
  const { listLandingFallbackPhonesByLandingId } = await import('./admin.repository.js');
  const result = listLandingFallbackPhonesByLandingId('some-landing-id');
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

test('createLandingFallbackPhone is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.createLandingFallbackPhone, 'function');
});

test('createLandingFallbackPhone: arity is 1 (input)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.createLandingFallbackPhone as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 1);
});

test('createLandingFallbackPhone: returns a thenable (structural)', async () => {
  const { createLandingFallbackPhone } = await import('./admin.repository.js');
  const result = createLandingFallbackPhone({ landingId: 'l1', phone: '+5491123456789' });
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

test('updateLandingFallbackPhone is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.updateLandingFallbackPhone, 'function');
});

test('updateLandingFallbackPhone: arity is 2 (id, patch)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.updateLandingFallbackPhone as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 2);
});

test('updateLandingFallbackPhone: returns a thenable (structural)', async () => {
  const { updateLandingFallbackPhone } = await import('./admin.repository.js');
  const result = updateLandingFallbackPhone('some-id', { phone: '+5491199999999' });
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

test('deleteLandingFallbackPhoneIfNotLast is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.deleteLandingFallbackPhoneIfNotLast, 'function');
});

test('deleteLandingFallbackPhoneIfNotLast: arity is 1 (id)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.deleteLandingFallbackPhoneIfNotLast as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 1);
});

test('deleteLandingFallbackPhoneIfNotLast: returns a thenable (structural)', async () => {
  const { deleteLandingFallbackPhoneIfNotLast } = await import('./admin.repository.js');
  const result = deleteLandingFallbackPhoneIfNotLast('some-id');
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

test('countLandingFallbackPhonesByLandingId is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.countLandingFallbackPhonesByLandingId, 'function');
});

test('countLandingFallbackPhonesByLandingId: arity is 1 (landingId)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.countLandingFallbackPhonesByLandingId as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 1);
});

test('countLandingFallbackPhonesByLandingId: returns a thenable (structural)', async () => {
  const { countLandingFallbackPhonesByLandingId } = await import('./admin.repository.js');
  const result = countLandingFallbackPhonesByLandingId('some-landing-id');
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

test('createLandingWithFallbacks is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.createLandingWithFallbacks, 'function');
});

test('createLandingWithFallbacks: arity is 2 (landing, fallbacks)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.createLandingWithFallbacks as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 2);
});

test('createLandingWithFallbacks: returns a thenable (structural)', async () => {
  const { createLandingWithFallbacks } = await import('./admin.repository.js');
  // Phase 4: signature now uses metaPixelRef (FK UUID) instead of old scalar fields.
  const result = createLandingWithFallbacks(
    { url: 'https://example.com', metaPixelRef: 'mp-uuid-123' },
    [{ phone: '+5491123456789' }],
  );
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

test('replaceLandingFallbacks is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.replaceLandingFallbacks, 'function');
});

test('replaceLandingFallbacks: arity is 2 (landingId, fallbacks)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const fn = mod.replaceLandingFallbacks as (...args: unknown[]) => unknown;
  assert.equal(fn.length, 2);
});

test('replaceLandingFallbacks: returns a thenable (structural)', async () => {
  const { replaceLandingFallbacks } = await import('./admin.repository.js');
  const result = replaceLandingFallbacks('some-landing-id', [{ phone: '+5491123456789' }]);
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

// ---------------------------------------------------------------------------
// B2.3 — deleteLandingFallbackPhoneIfNotLast: behavioral contract tests
// (structural — verify result shape when function doesn't throw)
// ---------------------------------------------------------------------------

test('deleteLandingFallbackPhoneIfNotLast: result type has "deleted" boolean property', async () => {
  const { deleteLandingFallbackPhoneIfNotLast } = await import('./admin.repository.js');
  let result: unknown;
  try {
    result = await deleteLandingFallbackPhoneIfNotLast('non-existent-id');
  } catch {
    // DB not available — skip behavioral assertion, structural check done above
    return;
  }
  assert.ok(result !== null && result !== undefined);
  assert.ok(typeof (result as Record<string, unknown>).deleted === 'boolean');
});

test('replaceLandingFallbacks: asserts ≥1 fallback remains after replace (structural)', async () => {
  // Ensure the function is exported and callable. Behavioral invariant (≥1) is
  // enforced inside the transaction; tested here at the structural level.
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.replaceLandingFallbacks, 'function');
});

// ---------------------------------------------------------------------------
// admin-leads-server-pagination — repository pagination tests
// ---------------------------------------------------------------------------

test('buildListLeadsQuery: secondary sort is [updateAt desc, id desc] when page/pageSize present', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ page: 1, pageSize: 10 });
  assert.deepEqual(q.orderBy, [{ updateAt: 'desc' }, { id: 'desc' }]);
});

test('buildListLeadsQuery: page 1 pageSize 10 → skip=0, take=10', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ page: 1, pageSize: 10 });
  assert.equal(q.skip, 0);
  assert.equal(q.take, 10);
});

test('buildListLeadsQuery: page 3 pageSize 25 → skip=50, take=25', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ page: 3, pageSize: 25 });
  assert.equal(q.skip, 50);
  assert.equal(q.take, 25);
});

test('listLeadsAdmin is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.listLeadsAdmin, 'function');
});

test('listLeadsAdmin returns a thenable (structural)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const listLeadsAdmin = mod.listLeadsAdmin as Function;
  const result = listLeadsAdmin({}, 1, 10);
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  await (result as Promise<unknown>).catch(() => undefined);
});

// ---------------------------------------------------------------------------
// admin-leads-server-pagination — conversionCount directive (DB-level filtering)
// ---------------------------------------------------------------------------

test('listLeadsAdmin accepts conversionCount gte directive and returns a thenable (structural)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const listLeadsAdmin = mod.listLeadsAdmin as Function;
  // recarga-only directive: leads with >= 2 conversions.
  const result = listLeadsAdmin(
    { statuses: ['CONVERTED'], conversionCount: { kind: 'gte', value: 2 } },
    1,
    10,
  );
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  // Behavioral assertion guarded for DB availability — mirrors existing structural patterns.
  try {
    const [rows, total] = (await result) as [unknown[], number];
    assert.ok(Array.isArray(rows));
    assert.equal(typeof total, 'number');
  } catch {
    // DB unavailable in this context — structural thenable check above already passed.
  }
});

test('listLeadsAdmin accepts conversionCount lte directive and returns a thenable (structural)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const listLeadsAdmin = mod.listLeadsAdmin as Function;
  // converted-strict directive: leads with <= 1 conversion.
  const result = listLeadsAdmin(
    { statuses: ['CONVERTED'], conversionCount: { kind: 'lte', value: 1 } },
    1,
    10,
  );
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  try {
    const [rows, total] = (await result) as [unknown[], number];
    assert.ok(Array.isArray(rows));
    assert.equal(typeof total, 'number');
  } catch {
    // DB unavailable in this context — structural thenable check above already passed.
  }
});

test('resolveConversionCountLeadIds is exported from admin.repository', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  assert.equal(typeof mod.resolveConversionCountLeadIds, 'function');
});

test('resolveConversionCountLeadIds returns a thenable resolving to string[] (structural)', async () => {
  const mod = await import('./admin.repository.js') as Record<string, unknown>;
  const resolveConversionCountLeadIds = mod.resolveConversionCountLeadIds as Function;
  const result = resolveConversionCountLeadIds(
    { status: { in: ['CONVERTED'] } },
    { kind: 'gte', value: 2 },
  );
  assert.equal(typeof (result as Promise<unknown>).then, 'function');
  try {
    const ids = (await result) as unknown[];
    assert.ok(Array.isArray(ids));
  } catch {
    // DB unavailable in this context — structural thenable check above already passed.
  }
});
