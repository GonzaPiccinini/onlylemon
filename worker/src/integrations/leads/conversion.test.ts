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
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

const normalizePhone = (phone: string): string => phone.replace(/\D/g, '');

const sha256 = async (value: string): Promise<string> =>
  crypto.createHash('sha256').update(value).digest('hex');

test('sendMetaConversion sends only Purchase when value is below 10000', async () => {
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
      value: 9999,
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
      tiers: [
        { eventName: 'HighValueTier1', required: false, sent: false },
        { eventName: 'HighValueTier2', required: false, sent: false },
        { eventName: 'HighValueTier3', required: false, sent: false },
      ],
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
    assert.deepEqual(body.data[0].custom_data, { currency: 'ARS', value: 9999 });
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
      tiers: [
        { eventName: 'HighValueTier1', required: false, sent: false },
        { eventName: 'HighValueTier2', required: false, sent: false },
        { eventName: 'HighValueTier3', required: false, sent: false },
      ],
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
      tiers: [
        { eventName: 'HighValueTier1', required: false, sent: false },
        { eventName: 'HighValueTier2', required: false, sent: false },
        { eventName: 'HighValueTier3', required: false, sent: false },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion sends Tier1 when value is exactly 25000', async () => {
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
      phone: '+54 9 11 1111-1111',
      value: 25000,
      fbc: 'fb.1.t1',
      fbp: 'fb.1.t1',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-t1',
      metaAccessToken: 'token-t1',
      eventId: 'lead-tier1',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'T1AA1111',
    };

    const result = await sendMetaConversion(payload);

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: true,
      highValueSent: true,
      tiers: [
        { eventName: 'HighValueTier1', required: true, sent: true },
        { eventName: 'HighValueTier2', required: false, sent: false },
        { eventName: 'HighValueTier3', required: false, sent: false },
      ],
    });
    assert.equal(calls.length, 3);

    const eventNames = calls.map((c) => {
      const body = JSON.parse(String(c.init?.body)) as {
        data: Array<{ event_name: string; event_id: string }>;
      };
      return { name: body.data[0].event_name, id: body.data[0].event_id };
    });

    assert.deepEqual(eventNames, [
      { name: 'Purchase', id: 'lead-tier1' },
      { name: 'HighValueCustomer', id: 'lead-tier1-hvc' },
      { name: 'HighValueTier1', id: 'lead-tier1-hvt1' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion sends Tier1 and Tier2 when value is 50000', async () => {
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
    const result = await sendMetaConversion({
      phone: '+54 9 11 2222-2222',
      value: 50000,
      fbc: 'fb.1.t2',
      fbp: 'fb.1.t2',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-t2',
      metaAccessToken: 'token-t2',
      eventId: 'lead-tier2',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'T2BB2222',
    });

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: true,
      highValueSent: true,
      tiers: [
        { eventName: 'HighValueTier1', required: true, sent: true },
        { eventName: 'HighValueTier2', required: true, sent: true },
        { eventName: 'HighValueTier3', required: false, sent: false },
      ],
    });
    assert.equal(calls.length, 4);

    const eventNames = calls.map((c) => {
      const body = JSON.parse(String(c.init?.body)) as {
        data: Array<{ event_name: string }>;
      };
      return body.data[0].event_name;
    });

    assert.deepEqual(eventNames, [
      'Purchase',
      'HighValueCustomer',
      'HighValueTier1',
      'HighValueTier2',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion sends all tiers when value is 100000', async () => {
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
    const result = await sendMetaConversion({
      phone: '+54 9 11 3333-3333',
      value: 100000,
      fbc: 'fb.1.t3',
      fbp: 'fb.1.t3',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-t3',
      metaAccessToken: 'token-t3',
      eventId: 'lead-tier3',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'T3CC3333',
    });

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: true,
      highValueSent: true,
      tiers: [
        { eventName: 'HighValueTier1', required: true, sent: true },
        { eventName: 'HighValueTier2', required: true, sent: true },
        { eventName: 'HighValueTier3', required: true, sent: true },
      ],
    });
    assert.equal(calls.length, 5);

    const eventNames = calls.map((c) => {
      const body = JSON.parse(String(c.init?.body)) as {
        data: Array<{ event_name: string; event_id: string }>;
      };
      return { name: body.data[0].event_name, id: body.data[0].event_id };
    });

    assert.deepEqual(eventNames, [
      { name: 'Purchase', id: 'lead-tier3' },
      { name: 'HighValueCustomer', id: 'lead-tier3-hvc' },
      { name: 'HighValueTier1', id: 'lead-tier3-hvt1' },
      { name: 'HighValueTier2', id: 'lead-tier3-hvt2' },
      { name: 'HighValueTier3', id: 'lead-tier3-hvt3' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion uses the currency from the provided config', async () => {
  const originalFetch = globalThis.fetch;

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response;
  }) as typeof fetch;

  try {
    const { sendMetaConversion } = await import('./conversion.js');
    await sendMetaConversion(
      {
        phone: '+55 11 99999-0000',
        value: 500,
        fbc: 'fb.1.brl',
        fbp: 'fb.1.brl',
        userAgent: 'Mozilla/5.0',
        metaPixelId: 'pixel-brl',
        metaAccessToken: 'token-brl',
        eventId: 'lead-brl',
        eventSourceUrl: 'https://cajero1.onlylemon.app',
        leadCode: 'BR12CD34',
      },
      {
        currency: 'BRL',
        thresholds: { highValue: 10_000, tier1: 25_000, tier2: 50_000, tier3: 100_000 },
      },
    );

    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].init?.body)) as {
      data: Array<{ custom_data: { currency: string; value: number } }>;
    };
    assert.deepEqual(body.data[0].custom_data, { currency: 'BRL', value: 500 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion honors custom high-value thresholds from config', async () => {
  const originalFetch = globalThis.fetch;

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response;
  }) as typeof fetch;

  try {
    const { sendMetaConversion } = await import('./conversion.js');
    // value 100 with low thresholds → Purchase + HighValueCustomer + Tier1, but not Tier2/Tier3.
    const result = await sendMetaConversion(
      {
        phone: '+1 555 000 0000',
        value: 100,
        fbc: 'fb.1.usd',
        fbp: 'fb.1.usd',
        userAgent: 'Mozilla/5.0',
        metaPixelId: 'pixel-usd',
        metaAccessToken: 'token-usd',
        eventId: 'lead-usd',
        eventSourceUrl: 'https://cajero1.onlylemon.app',
        leadCode: 'US12CD34',
      },
      {
        currency: 'USD',
        thresholds: { highValue: 50, tier1: 100, tier2: 250, tier3: 500 },
      },
    );

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: true,
      highValueSent: true,
      tiers: [
        { eventName: 'HighValueTier1', required: true, sent: true },
        { eventName: 'HighValueTier2', required: false, sent: false },
        { eventName: 'HighValueTier3', required: false, sent: false },
      ],
    });

    const eventNames = calls.map((c) => {
      const body = JSON.parse(String(c.init?.body)) as { data: Array<{ event_name: string }> };
      return body.data[0].event_name;
    });
    assert.deepEqual(eventNames, ['Purchase', 'HighValueCustomer', 'HighValueTier1']);

    // currency propagates to every money event
    for (const c of calls) {
      const body = JSON.parse(String(c.init?.body)) as {
        data: Array<{ custom_data: { currency: string } }>;
      };
      assert.equal(body.data[0].custom_data.currency, 'USD');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion defaults to ARS and original thresholds when no config passed', async () => {
  const originalFetch = globalThis.fetch;

  const calls: Array<{ init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ init });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response;
  }) as typeof fetch;

  try {
    const { sendMetaConversion } = await import('./conversion.js');
    await sendMetaConversion({
      phone: '+54 9 11 5555-5555',
      value: 9999,
      fbc: 'fb.1.def',
      fbp: 'fb.1.def',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-def',
      metaAccessToken: 'token-def',
      eventId: 'lead-def',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'DE12CD34',
    });

    // 9999 < default highValue (10000) → only Purchase, currency ARS
    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].init?.body)) as {
      data: Array<{ custom_data: { currency: string; value: number } }>;
    };
    assert.deepEqual(body.data[0].custom_data, { currency: 'ARS', value: 9999 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendMetaConversion does not send Tier1 when value is just below threshold', async () => {
  const originalFetch = globalThis.fetch;

  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response;
  }) as typeof fetch;

  try {
    const { sendMetaConversion } = await import('./conversion.js');
    const result = await sendMetaConversion({
      phone: '+54 9 11 4444-4444',
      value: 24999,
      fbc: 'fb.1.t0',
      fbp: 'fb.1.t0',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-t0',
      metaAccessToken: 'token-t0',
      eventId: 'lead-below',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'T0DD4444',
    });

    assert.deepEqual(result, {
      purchaseSent: true,
      highValueRequired: true,
      highValueSent: true,
      tiers: [
        { eventName: 'HighValueTier1', required: false, sent: false },
        { eventName: 'HighValueTier2', required: false, sent: false },
        { eventName: 'HighValueTier3', required: false, sent: false },
      ],
    });
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('omits fbc/fbp from user_data when they are empty (blocked pixel)', async () => {
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
    const { sendContactEvent } = await import('./conversion.js');

    await sendContactEvent({
      fbc: '',
      fbp: '',
      userAgent: 'Mozilla/5.0',
      metaPixelId: 'pixel-blocked',
      metaAccessToken: 'token-blocked',
      eventId: 'contact-blocked',
      eventSourceUrl: 'https://cajero1.onlylemon.app',
      leadCode: 'BLOCKED1',
    });

    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0]!.init!.body)) as {
      data: Array<{ user_data: Record<string, unknown> }>;
    };
    const userData = body.data[0]!.user_data;
    assert.equal('fbc' in userData, false, 'fbc must be omitted when empty');
    assert.equal('fbp' in userData, false, 'fbp must be omitted when empty');
    assert.equal(userData.client_user_agent, 'Mozilla/5.0');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
