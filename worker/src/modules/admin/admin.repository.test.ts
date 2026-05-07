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
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

test('buildListLeadsQuery orders leads by updateAt desc', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');

  const query = buildListLeadsQuery({});

  assert.deepEqual(query.orderBy, {
    updateAt: 'desc',
  });
});

test('buildListLeadsQuery keeps optional status, cashier and adCode filters', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');

  const query = buildListLeadsQuery({
    status: 'CONTACTED',
    cashierId: 'cashier-123',
    adCode: 'camp-2026',
  });

  assert.deepEqual(query.where, {
    status: 'CONTACTED',
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

test('buildListConversionsQuery: code filter → lead.code contains (case-sensitive)', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({ code: 'LEAD' });
  assert.deepEqual(q.where.lead?.code, { contains: 'LEAD' });
});

test('buildListConversionsQuery: orders by createdAt desc', async () => {
  const { buildListConversionsQuery } = await import('./admin.repository.js');
  const q = buildListConversionsQuery({});
  assert.deepEqual(q.orderBy, { createdAt: 'desc' });
});

// ---------------------------------------------------------------------------
// M2.7 — buildListLeadsQuery new filters (code, phone, cashierIds, status)
// ---------------------------------------------------------------------------

test('buildListLeadsQuery: code filter uses case-sensitive contains (no mode: insensitive)', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ code: 'LEAD001' });
  assert.deepEqual(q.where.code, { contains: 'LEAD001' });
  // Must NOT have mode: insensitive (unlike adCode)
  assert.equal((q.where.code as { mode?: string }).mode, undefined);
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

test('buildListLeadsQuery: status filter (CONVERTED) sets status field', async () => {
  const { buildListLeadsQuery } = await import('./admin.repository.js');
  const q = buildListLeadsQuery({ status: 'CONVERTED' });
  assert.equal(q.where.status, 'CONVERTED');
});

test('buildListConversionsQuery: listConversionsAdmin function is exported', async () => {
  const { listConversionsAdmin } = await import('./admin.repository.js');
  assert.equal(typeof listConversionsAdmin, 'function');
});
