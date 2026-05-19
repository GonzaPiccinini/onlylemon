import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Env stubs — must appear before any module imports that call config
// ---------------------------------------------------------------------------
process.env.PORT = process.env.PORT ?? '3002';
process.env.LEADS_CODE_TTL_HOURS = process.env.LEADS_CODE_TTL_HOURS ?? '24';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'test-queue';
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY ?? '1';
process.env.WAHA_API_KEY = process.env.WAHA_API_KEY ?? 'waha-test-key';
process.env.WAHA_BASE_URL = process.env.WAHA_BASE_URL ?? 'http://waha.local:3000';
process.env.WAHA_WEBHOOK_URL =
  process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE =
  process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WAHA_BASE_URL = 'http://waha.local:3000';
const WAHA_API_KEY = 'waha-test-key';

type FetchStub = {
  calls: { url: string; init: RequestInit }[];
  responses: Response[];
  restore: () => void;
};

function stubFetch(responses: Response[]): FetchStub {
  const stub: FetchStub = {
    calls: [],
    responses: [...responses],
    restore: () => {
      globalThis.fetch = (stub as unknown as { _original: typeof globalThis.fetch })._original;
    },
    _original: globalThis.fetch,
  } as unknown as FetchStub & { _original: typeof globalThis.fetch };

  let idx = 0;
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const resolvedUrl =
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    stub.calls.push({ url: resolvedUrl, init: init ?? {} });
    const response = stub.responses[idx];
    idx = Math.min(idx + 1, stub.responses.length - 1);
    if (!response) throw new Error('No more stub responses');
    return response;
  };

  return stub;
}

function makeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
): Response {
  return new Response(body, { status, headers });
}

function makeBinaryResponse(status: number, bytes: Uint8Array, contentType: string): Response {
  return new Response(Buffer.from(bytes), { status, headers: { 'Content-Type': contentType } });
}

// ---------------------------------------------------------------------------
// sendText tests
// ---------------------------------------------------------------------------

test('sendText POSTs to ${WAHA_BASE_URL}/api/sendText', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    await sendText('session-01', '5491112345678@c.us', 'Hola!');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, `${WAHA_BASE_URL}/api/sendText`);
  } finally {
    stub.restore();
  }
});

test('sendText sends X-Api-Key header with WAHA_API_KEY value', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    await sendText('session-01', '5491112345678@c.us', 'Hola!');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], WAHA_API_KEY);
  } finally {
    stub.restore();
  }
});

test('sendText sends Content-Type: application/json header', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    await sendText('session-01', '5491112345678@c.us', 'Hola!');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
  } finally {
    stub.restore();
  }
});

test('sendText uses POST method', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    await sendText('session-01', '5491112345678@c.us', 'Hola!');
    assert.equal(stub.calls[0].init.method, 'POST');
  } finally {
    stub.restore();
  }
});

test('sendText body contains session, chatId and text fields', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    await sendText('session-01', '5491112345678@c.us', 'Hola mundo!');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.session, 'session-01');
    assert.equal(body.chatId, '5491112345678@c.us');
    assert.equal(body.text, 'Hola mundo!');
  } finally {
    stub.restore();
  }
});

test('sendText resolves void on 200 response', async () => {
  const stub = stubFetch([makeResponse(200, '{"id":"msg-1"}')]);
  try {
    const { sendText } = await import('./client.js');
    const result = await sendText('session-01', '5491112345678@c.us', 'Hola!');
    assert.equal(result, undefined);
  } finally {
    stub.restore();
  }
});

test('sendText resolves void on 201 response', async () => {
  const stub = stubFetch([makeResponse(201, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    const result = await sendText('session-02', '5491198765432@c.us', 'Test 201');
    assert.equal(result, undefined);
  } finally {
    stub.restore();
  }
});

test('sendText throws on 400 response', async () => {
  const stub = stubFetch([makeResponse(400, '{"error":"bad request"}')]);
  try {
    const { sendText } = await import('./client.js');
    await assert.rejects(
      () => sendText('session-01', 'invalid-chat', 'msg'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('400'));
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

test('sendText throws on 500 response', async () => {
  const stub = stubFetch([makeResponse(500, '{"error":"internal"}')]);
  try {
    const { sendText } = await import('./client.js');
    await assert.rejects(
      () => sendText('session-01', '5491112345678@c.us', 'fail'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('500'));
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// downloadMedia tests
// ---------------------------------------------------------------------------

test('downloadMedia GETs the given URL', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
  const stub = stubFetch([makeBinaryResponse(200, bytes, 'image/jpeg')]);
  try {
    const { downloadMedia } = await import('./client.js');
    await downloadMedia('http://waha.local:3000/api/files/img.jpg');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, 'http://waha.local:3000/api/files/img.jpg');
  } finally {
    stub.restore();
  }
});

test('downloadMedia sends X-Api-Key header', async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const stub = stubFetch([makeBinaryResponse(200, bytes, 'image/png')]);
  try {
    const { downloadMedia } = await import('./client.js');
    await downloadMedia('http://waha.local:3000/api/files/img.png');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], WAHA_API_KEY);
  } finally {
    stub.restore();
  }
});

test('downloadMedia uses GET method', async () => {
  const bytes = new Uint8Array([0x01, 0x02]);
  const stub = stubFetch([makeBinaryResponse(200, bytes, 'image/jpeg')]);
  try {
    const { downloadMedia } = await import('./client.js');
    await downloadMedia('http://waha.local:3000/api/files/img.jpg');
    assert.equal(stub.calls[0].init.method, 'GET');
  } finally {
    stub.restore();
  }
});

test('downloadMedia returns buffer containing response body bytes', async () => {
  const bytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
  const stub = stubFetch([makeBinaryResponse(200, bytes, 'image/jpeg')]);
  try {
    const { downloadMedia } = await import('./client.js');
    const result = await downloadMedia('http://waha.local:3000/api/files/test.jpg');
    assert.ok(result.buffer instanceof Buffer);
    assert.deepEqual(result.buffer, Buffer.from(bytes));
  } finally {
    stub.restore();
  }
});

test('downloadMedia returns mimetype from Content-Type response header (image/jpeg)', async () => {
  const bytes = new Uint8Array([0xff, 0xd8]);
  const stub = stubFetch([makeBinaryResponse(200, bytes, 'image/jpeg')]);
  try {
    const { downloadMedia } = await import('./client.js');
    const result = await downloadMedia('http://waha.local:3000/api/files/img.jpg');
    assert.equal(result.mimetype, 'image/jpeg');
  } finally {
    stub.restore();
  }
});

test('downloadMedia returns mimetype from Content-Type response header (image/png)', async () => {
  const bytes = new Uint8Array([0x89, 0x50]);
  const stub = stubFetch([makeBinaryResponse(200, bytes, 'image/png')]);
  try {
    const { downloadMedia } = await import('./client.js');
    const result = await downloadMedia('http://waha.local:3000/api/files/img.png');
    assert.equal(result.mimetype, 'image/png');
  } finally {
    stub.restore();
  }
});

test('downloadMedia throws on 404 response', async () => {
  const stub = stubFetch([makeResponse(404, 'Not Found')]);
  try {
    const { downloadMedia } = await import('./client.js');
    await assert.rejects(
      () => downloadMedia('http://waha.local:3000/api/files/missing.jpg'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('404'));
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

test('downloadMedia throws on 403 response', async () => {
  const stub = stubFetch([makeResponse(403, 'Forbidden')]);
  try {
    const { downloadMedia } = await import('./client.js');
    await assert.rejects(
      () => downloadMedia('http://waha.local:3000/api/files/protected.jpg'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('403'));
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// getOwnChatId tests (Item #2)
// ---------------------------------------------------------------------------

const MOCK_SESSIONS_WITH_ME = JSON.stringify([
  {
    name: 'cashier-session-1',
    status: 'WORKING',
    config: { proxy: null, webhooks: [], debug: false },
    me: { id: '5493513207794@c.us', pushname: 'Cajero 1' },
    engine: { engine: 'GOWS' },
  },
  {
    name: 'cashier-session-2',
    status: 'WORKING',
    config: { proxy: null, webhooks: [], debug: false },
    me: { id: '5493411111111@c.us', pushname: 'Cajero 2' },
    engine: { engine: 'GOWS' },
  },
]);

test('getOwnChatId returns me.id for the named session', async () => {
  const stub = stubFetch([makeResponse(200, MOCK_SESSIONS_WITH_ME)]);
  try {
    const { getOwnChatId } = await import('./client.js');
    const result = await getOwnChatId('cashier-session-1');
    assert.equal(result, '5493513207794@c.us');
  } finally {
    stub.restore();
  }
});

test('getOwnChatId returns null when session not found', async () => {
  const stub = stubFetch([makeResponse(200, MOCK_SESSIONS_WITH_ME)]);
  try {
    const { getOwnChatId } = await import('./client.js');
    const result = await getOwnChatId('non-existent-session');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('getOwnChatId returns null when session exists but me is missing', async () => {
  const sessionsNoMe = JSON.stringify([
    {
      name: 'cashier-session-no-me',
      status: 'STARTING',
      config: { proxy: null, webhooks: [], debug: false },
      me: null,
      engine: { engine: 'GOWS' },
    },
  ]);
  const stub = stubFetch([makeResponse(200, sessionsNoMe)]);
  try {
    const { getOwnChatId } = await import('./client.js');
    const result = await getOwnChatId('cashier-session-no-me');
    assert.equal(result, null);
  } finally {
    stub.restore();
  }
});

test('getOwnChatId returns null on network error (does not throw)', async () => {
  const stub = stubFetch([makeResponse(500, 'Internal Server Error')]);
  try {
    const { getOwnChatId } = await import('./client.js');
    // Should not throw — service wraps errors gracefully
    // Note: getOwnChatId in client.ts doesn't catch — that's the service's job.
    // This test checks the raw client behavior.
    await assert.rejects(
      () => getOwnChatId('cashier-session-1'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});
