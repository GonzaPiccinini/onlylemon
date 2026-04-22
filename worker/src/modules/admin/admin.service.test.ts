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

test('toLeadDto exposes activityAt using lead updateAt', async () => {
  const { toLeadDto } = await import('./admin.service.js');

  const createdAt = new Date('2026-04-21T10:00:00.000Z');
  const updateAt = new Date('2026-04-21T12:30:00.000Z');
  const dto = toLeadDto({
    id: 'lead-1',
    code: 'ABCD1234',
    adCode: 'ad-001',
    status: 'CONTACTED',
    phone: '5491111111111',
    amount: 5000,
    metaPixelId: 'pixel-1',
    contactedAt: updateAt,
    convertedAt: null,
    expiresAt: new Date('2026-04-22T10:00:00.000Z'),
    createdAt,
    updateAt,
    cashier: null,
  });

  assert.equal(dto.activityAt.toISOString(), updateAt.toISOString());
  assert.equal(dto.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(dto.adCode, 'ad-001');
});

test('toLeadDto keeps activityAt when lead has cashier and null amount', async () => {
  const { toLeadDto } = await import('./admin.service.js');

  const updateAt = new Date('2026-04-21T14:45:00.000Z');
  const dto = toLeadDto({
    id: 'lead-2',
    code: 'WXYZ9876',
    adCode: null,
    status: 'NOT_CONTACTED',
    phone: null,
    amount: null,
    metaPixelId: 'pixel-2',
    contactedAt: null,
    convertedAt: null,
    expiresAt: new Date('2026-04-22T10:00:00.000Z'),
    createdAt: new Date('2026-04-21T10:00:00.000Z'),
    updateAt,
    cashier: {
      id: 'cashier-1',
      user: {
        name: 'Juan',
        username: 'juan',
      },
    },
  });

  assert.equal(dto.activityAt.toISOString(), updateAt.toISOString());
  assert.equal(dto.amount, null);
  assert.equal(dto.cashierName, 'Juan');
  assert.equal(dto.adCode, null);
});
