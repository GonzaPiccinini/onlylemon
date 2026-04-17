import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

const normalizePhone = (phone: string): string => phone.replace(/\D/g, '');

const sha256 = async (value: string): Promise<string> =>
  crypto.createHash('sha256').update(value).digest('hex');

test('sendMetaConversion sends only Purchase when value is 10000 or below', async () => {
  const originalFetch = globalThis.fetch;

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  try {
    const { sendMetaConversion } = await import('./conversion.js');
    const payload = {
      phone: '+54 9 11 1234-5678',
      value: 10000,
      fbc: 'fb.1.111',
      fbp: 'fb.1.222',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-1',
      metaAccessToken: 'token-1',
      eventId: 'lead-abc',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'AB12CD34',
    };

    const result = await sendMetaConversion(payload);

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: false,
      highValueSent: false,
    });
    assert.equal(calls.length, 1);

    const request = calls[0];
    assert.match(
      request.url,
      /^https:\/\/graph\.facebook\.com\/v21\.0\/pixel-1\/events\?access_token=token-1$/,
    );
    assert.equal(request.init?.method, 'POST');
    assert.equal((request.init?.headers as Record<string, string>)['Content-Type'], 'application/json');

    const body = JSON.parse(String(request.init?.body)) as {
      data: Array<{
        event_name: string;
        event_id: string;
        action_source: string;
        event_source_url: string;
        custom_data: { currency: string; value: number };
        user_data: {
          ph: string[];
          external_id: string[];
          fbc: string;
          fbp: string;
          client_user_agent: string;
        };
      }>;
    };

    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].event_name, 'Purchase');
    assert.equal(body.data[0].event_id, 'lead-abc');
    assert.equal(body.data[0].action_source, 'website');
    assert.equal(body.data[0].event_source_url, 'https://cajero1.onlylemon.app');
    assert.deepEqual(body.data[0].custom_data, { currency: 'ARS', value: 10000 });
    assert.equal(body.data[0].user_data.fbc, 'fb.1.111');
    assert.equal(body.data[0].user_data.fbp, 'fb.1.222');
    assert.equal(body.data[0].user_data.client_user_agent, 'Mozilla/5.0');
    assert.deepEqual(body.data[0].user_data.ph, [await sha256(normalizePhone(payload.phone))]);
    assert.deepEqual(body.data[0].user_data.external_id, [await sha256(payload.leadCode.toLowerCase())]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion sends Purchase and HighValueCustomer when value is above 10000', async () => {
  const originalFetch = globalThis.fetch;

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  try {
    const { sendMetaConversion } = await import('./conversion.js');
    const payload = {
      phone: '+54 9 11 7654-3210',
      value: 15000,
      fbc: 'fb.1.333',
      fbp: 'fb.1.444',
      userAgent: 'Mozilla/5.0 (Linux)',
      metaPixelId: 'pixel-2',
      metaAccessToken: 'token-2',
      eventId: 'lead-high',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'XY78ZQ90',
    };

    const result = await sendMetaConversion(payload);

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: true,
      highValueSent: true,
    });
    assert.equal(calls.length, 2);

    for (const call of calls) {
      assert.match(
        call.url,
        /^https:\/\/graph\.facebook\.com\/v21\.0\/pixel-2\/events\?access_token=token-2$/,
      );
      assert.equal(call.init?.method, 'POST');
    }

    const firstBody = JSON.parse(String(calls[0].init?.body)) as {
      data: Array<{ event_name: string; event_id: string; user_data: { ph: string[]; external_id: string[] } }>;
    };
    const secondBody = JSON.parse(String(calls[1].init?.body)) as {
      data: Array<{ event_name: string; event_id: string; user_data: { ph: string[]; external_id: string[] } }>;
    };

    assert.equal(firstBody.data[0].event_name, 'Purchase');
    assert.equal(firstBody.data[0].event_id, 'lead-high');

    assert.equal(secondBody.data[0].event_name, 'HighValueCustomer');
    assert.equal(secondBody.data[0].event_id, 'lead-high-hvc');

    const expectedHash = await sha256(normalizePhone(payload.phone));
    const expectedExternalId = await sha256(payload.leadCode.toLowerCase());
    assert.deepEqual(firstBody.data[0].user_data.ph, [expectedHash]);
    assert.deepEqual(secondBody.data[0].user_data.ph, [expectedHash]);
    assert.deepEqual(firstBody.data[0].user_data.external_id, [expectedExternalId]);
    assert.deepEqual(secondBody.data[0].user_data.external_id, [expectedExternalId]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion reports partial success when high value event fails', async () => {
  const originalFetch = globalThis.fetch;

  let count = 0;
  globalThis.fetch = (async () => {
    count += 1;
    return {
      ok: count === 1,
      status: count === 1 ? 200 : 500,
      json: async () => ({}),
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  try {
    const { sendMetaConversion } = await import('./conversion.js');
    const result = await sendMetaConversion({
      phone: '+54 9 11 7000-0000',
      value: 12000,
      fbc: 'fb.1.555',
      fbp: 'fb.1.666',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-3',
      metaAccessToken: 'token-3',
      eventId: 'lead-partial',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'MN56OP78',
    });

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: true,
      highValueSent: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
