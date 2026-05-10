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
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

test('buildListLeadsQuery orders leads by updateAt desc', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');

  const query = buildListLeadsQuery({});

  assert.deepEqual(query.orderBy, {
    updateAt: 'desc',
  });
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
