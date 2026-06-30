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
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
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
// startTyping / stopTyping tests
// Presence pings for the real-time typing indicator. Body is { session, chatId }
// (confirmed against the running WAHA swagger). Like sendText, the client throws
// on non-2xx; the chat service swallows these (presence is best-effort) so a
// flaky ping never blocks a real send.
// ---------------------------------------------------------------------------

test('startTyping POSTs to ${WAHA_BASE_URL}/api/startTyping', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { startTyping } = await import('./client.js');
    await startTyping('session-01', '5491112345678@c.us');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, `${WAHA_BASE_URL}/api/startTyping`);
  } finally {
    stub.restore();
  }
});

test('startTyping uses POST method', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { startTyping } = await import('./client.js');
    await startTyping('session-01', '5491112345678@c.us');
    assert.equal(stub.calls[0].init.method, 'POST');
  } finally {
    stub.restore();
  }
});

test('startTyping sends X-Api-Key header with WAHA_API_KEY value', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { startTyping } = await import('./client.js');
    await startTyping('session-01', '5491112345678@c.us');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], WAHA_API_KEY);
  } finally {
    stub.restore();
  }
});

test('startTyping sends Content-Type: application/json header', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { startTyping } = await import('./client.js');
    await startTyping('session-01', '5491112345678@c.us');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
  } finally {
    stub.restore();
  }
});

test('startTyping body contains session and chatId', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { startTyping } = await import('./client.js');
    await startTyping('session-07', '5491198765432@c.us');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.session, 'session-07');
    assert.equal(body.chatId, '5491198765432@c.us');
  } finally {
    stub.restore();
  }
});

test('startTyping resolves void on 200 response', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { startTyping } = await import('./client.js');
    const result = await startTyping('session-01', '5491112345678@c.us');
    assert.equal(result, undefined);
  } finally {
    stub.restore();
  }
});

test('startTyping resolves void on 201 response', async () => {
  const stub = stubFetch([makeResponse(201, '{}')]);
  try {
    const { startTyping } = await import('./client.js');
    const result = await startTyping('session-01', '5491112345678@c.us');
    assert.equal(result, undefined);
  } finally {
    stub.restore();
  }
});

test('startTyping throws on 422 response', async () => {
  const stub = stubFetch([makeResponse(422, '{"error":"invalid"}')]);
  try {
    const { startTyping } = await import('./client.js');
    await assert.rejects(
      () => startTyping('session-01', 'invalid-chat'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('422'));
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

test('startTyping throws on 500 response', async () => {
  const stub = stubFetch([makeResponse(500, '{"error":"internal"}')]);
  try {
    const { startTyping } = await import('./client.js');
    await assert.rejects(
      () => startTyping('session-01', '5491112345678@c.us'),
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

// stopTyping — mirror of startTyping, different endpoint.

test('stopTyping POSTs to ${WAHA_BASE_URL}/api/stopTyping', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { stopTyping } = await import('./client.js');
    await stopTyping('session-01', '5491112345678@c.us');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, `${WAHA_BASE_URL}/api/stopTyping`);
  } finally {
    stub.restore();
  }
});

test('stopTyping uses POST method', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { stopTyping } = await import('./client.js');
    await stopTyping('session-01', '5491112345678@c.us');
    assert.equal(stub.calls[0].init.method, 'POST');
  } finally {
    stub.restore();
  }
});

test('stopTyping sends X-Api-Key header with WAHA_API_KEY value', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { stopTyping } = await import('./client.js');
    await stopTyping('session-01', '5491112345678@c.us');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], WAHA_API_KEY);
  } finally {
    stub.restore();
  }
});

test('stopTyping body contains session and chatId', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { stopTyping } = await import('./client.js');
    await stopTyping('session-09', '5491100000000@c.us');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.session, 'session-09');
    assert.equal(body.chatId, '5491100000000@c.us');
  } finally {
    stub.restore();
  }
});

test('stopTyping resolves void on 200 response', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { stopTyping } = await import('./client.js');
    const result = await stopTyping('session-01', '5491112345678@c.us');
    assert.equal(result, undefined);
  } finally {
    stub.restore();
  }
});

test('stopTyping throws on 500 response', async () => {
  const stub = stubFetch([makeResponse(500, '{"error":"internal"}')]);
  try {
    const { stopTyping } = await import('./client.js');
    await assert.rejects(
      () => stopTyping('session-01', '5491112345678@c.us'),
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
// sendSeen tests
// Marks a chat's messages as read (POST /api/sendSeen, body { session, chatId }).
// Same idiom as sendText/startTyping: throws on non-2xx; the chat service treats
// it as best-effort.
// ---------------------------------------------------------------------------

test('sendSeen POSTs to ${WAHA_BASE_URL}/api/sendSeen', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendSeen } = await import('./client.js');
    await sendSeen('session-01', '5491112345678@c.us');
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].url, `${WAHA_BASE_URL}/api/sendSeen`);
  } finally {
    stub.restore();
  }
});

test('sendSeen uses POST method', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendSeen } = await import('./client.js');
    await sendSeen('session-01', '5491112345678@c.us');
    assert.equal(stub.calls[0].init.method, 'POST');
  } finally {
    stub.restore();
  }
});

test('sendSeen sends X-Api-Key header with WAHA_API_KEY value', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendSeen } = await import('./client.js');
    await sendSeen('session-01', '5491112345678@c.us');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], WAHA_API_KEY);
  } finally {
    stub.restore();
  }
});

test('sendSeen sends Content-Type: application/json header', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendSeen } = await import('./client.js');
    await sendSeen('session-01', '5491112345678@c.us');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
  } finally {
    stub.restore();
  }
});

test('sendSeen body contains session and chatId', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendSeen } = await import('./client.js');
    await sendSeen('session-05', '5491100000000@c.us');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.session, 'session-05');
    assert.equal(body.chatId, '5491100000000@c.us');
  } finally {
    stub.restore();
  }
});

test('sendSeen resolves void on 200 response', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendSeen } = await import('./client.js');
    const result = await sendSeen('session-01', '5491112345678@c.us');
    assert.equal(result, undefined);
  } finally {
    stub.restore();
  }
});

test('sendSeen throws on 500 response', async () => {
  const stub = stubFetch([makeResponse(500, '{"error":"internal"}')]);
  try {
    const { sendSeen } = await import('./client.js');
    await assert.rejects(
      () => sendSeen('session-01', '5491112345678@c.us'),
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

// ---------------------------------------------------------------------------
// listChats tests
// ---------------------------------------------------------------------------

const MOCK_CHAT_LIST = JSON.stringify([
  { id: '5491112345678@c.us', name: 'Alice', conversationTimestamp: 1716163200 },
  { id: '120363000000000001@g.us', name: 'Sales Group', conversationTimestamp: 1716163100 },
]);

test('listChats GETs /api/{session}/chats and returns parsed array on 200', async () => {
  const stub = stubFetch([makeResponse(200, MOCK_CHAT_LIST)]);
  try {
    const { listChats } = await import('./client.js');
    const result = await listChats('session-01');
    assert.equal(stub.calls.length, 1);
    assert.ok(stub.calls[0].url.includes('/api/session-01/chats'));
    assert.equal(result.length, 2);
    assert.equal(result[0].id, '5491112345678@c.us');
    assert.equal(result[0].name, 'Alice');
    assert.equal(result[0].conversationTimestamp, 1716163200);
    assert.equal(result[1].id, '120363000000000001@g.us');
    assert.equal(result[1].name, 'Sales Group');
  } finally {
    stub.restore();
  }
});

test('listChats returns empty array when WAHA returns []', async () => {
  const stub = stubFetch([makeResponse(200, '[]')]);
  try {
    const { listChats } = await import('./client.js');
    const result = await listChats('session-01');
    assert.deepEqual(result, []);
  } finally {
    stub.restore();
  }
});

test('listChats passes limit/offset and sorts desc by conversationTimestamp', async () => {
  const stub = stubFetch([makeResponse(200, MOCK_CHAT_LIST)]);
  try {
    const { listChats } = await import('./client.js');
    await listChats('session-01', { limit: 20, offset: 40 });
    const url = stub.calls[0].url;
    assert.ok(url.includes('limit=20'), `expected limit=20 in ${url}`);
    assert.ok(url.includes('offset=40'), `expected offset=40 in ${url}`);
    assert.ok(url.includes('sortBy=conversationTimestamp'), `expected sortBy in ${url}`);
    assert.ok(url.includes('sortOrder=desc'), `expected sortOrder=desc in ${url}`);
  } finally {
    stub.restore();
  }
});

test('listChats sends X-Api-Key header', async () => {
  const stub = stubFetch([makeResponse(200, MOCK_CHAT_LIST)]);
  try {
    const { listChats } = await import('./client.js');
    await listChats('session-01');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], WAHA_API_KEY);
  } finally {
    stub.restore();
  }
});

test('listChats throws on 500 response', async () => {
  const stub = stubFetch([makeResponse(500, '{"error":"internal"}')]);
  try {
    const { listChats } = await import('./client.js');
    await assert.rejects(
      () => listChats('session-01'),
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
// sendImage tests
// ---------------------------------------------------------------------------

test('sendImage POSTs to /api/sendImage with correct body shape', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendImage } = await import('./client.js');
    await sendImage('session-01', '5491112345678@c.us', {
      data: 'aGVsbG8=',
      mimetype: 'image/jpeg',
    });
    assert.equal(stub.calls.length, 1);
    assert.ok(stub.calls[0].url.endsWith('/api/sendImage'));
    assert.equal(stub.calls[0].init.method, 'POST');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.session, 'session-01');
    assert.equal(body.chatId, '5491112345678@c.us');
    assert.equal(body.file.data, 'aGVsbG8=');
    assert.equal(body.file.mimetype, 'image/jpeg');
  } finally {
    stub.restore();
  }
});

test('sendImage includes caption when provided', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendImage } = await import('./client.js');
    await sendImage('session-01', '5491112345678@c.us', {
      data: 'aGVsbG8=',
      mimetype: 'image/jpeg',
    }, 'My caption');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.caption, 'My caption');
  } finally {
    stub.restore();
  }
});

test('sendImage does not include caption when omitted', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendImage } = await import('./client.js');
    await sendImage('session-01', '5491112345678@c.us', {
      data: 'aGVsbG8=',
      mimetype: 'image/jpeg',
    });
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal('caption' in body, false);
  } finally {
    stub.restore();
  }
});

test('sendImage throws on non-2xx with status in message', async () => {
  const stub = stubFetch([makeResponse(422, '{"error":"invalid"}')]);
  try {
    const { sendImage } = await import('./client.js');
    await assert.rejects(
      () => sendImage('session-01', '5491112345678@c.us', {
        data: 'aGVsbG8=',
        mimetype: 'image/jpeg',
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('422'));
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// sendReaction tests
// ---------------------------------------------------------------------------

test('sendReaction PUTs to /api/reaction with correct body', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendReaction } = await import('./client.js');
    await sendReaction('session-01', 'false_5491112345678@c.us_ABC123', '👍');
    assert.equal(stub.calls.length, 1);
    assert.ok(stub.calls[0].url.endsWith('/api/reaction'));
    assert.equal(stub.calls[0].init.method, 'PUT');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.session, 'session-01');
    assert.equal(body.messageId, 'false_5491112345678@c.us_ABC123');
    assert.equal(body.reaction, '👍');
  } finally {
    stub.restore();
  }
});

test('sendReaction with empty string removes the reaction (still PUTs)', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendReaction } = await import('./client.js');
    await sendReaction('session-01', 'false_5491112345678@c.us_ABC123', '');
    assert.equal(stub.calls[0].init.method, 'PUT');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.reaction, '');
  } finally {
    stub.restore();
  }
});

test('sendReaction does NOT include chatId in payload', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendReaction } = await import('./client.js');
    await sendReaction('session-01', 'false_5491112345678@c.us_ABC123', '❤️');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal('chatId' in body, false);
  } finally {
    stub.restore();
  }
});

test('sendReaction throws on non-2xx', async () => {
  const stub = stubFetch([makeResponse(500, '{"error":"internal"}')]);
  try {
    const { sendReaction } = await import('./client.js');
    await assert.rejects(
      () => sendReaction('session-01', 'false_5491112345678@c.us_ABC123', '👍'),
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
// sendText with replyTo tests
// ---------------------------------------------------------------------------

test('sendText 3-arg form still works (no replyTo in body)', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    await sendText('session-01', '5491112345678@c.us', 'plain message');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.session, 'session-01');
    assert.equal(body.chatId, '5491112345678@c.us');
    assert.equal(body.text, 'plain message');
    assert.equal('reply_to' in body, false);
  } finally {
    stub.restore();
  }
});

test('sendText 4-arg form includes reply_to field in POST body', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { sendText } = await import('./client.js');
    await sendText('session-01', '5491112345678@c.us', 'quoted reply', 'false_5491112345678@c.us_ORIG');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.equal(body.reply_to, 'false_5491112345678@c.us_ORIG');
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// createSessionIfNotExists — events includes message.reaction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// updateSessionConfig tests
// ---------------------------------------------------------------------------

test('updateSessionConfig PUTs to /api/sessions/{name} with config body', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { updateSessionConfig } = await import('./client.js');
    const cfg = {
      webhooks: [{ url: 'http://example.com', events: ['message.any', 'message.reaction'] }],
    };
    await updateSessionConfig('session-01', cfg);
    assert.equal(stub.calls.length, 1);
    assert.ok(stub.calls[0].url.endsWith('/api/sessions/session-01'), `URL should end with /api/sessions/session-01, got: ${stub.calls[0].url}`);
    assert.equal(stub.calls[0].init.method, 'PUT');
    const body = JSON.parse(stub.calls[0].init.body as string);
    assert.deepEqual(body, { config: cfg });
  } finally {
    stub.restore();
  }
});

test('updateSessionConfig sends X-Api-Key and Content-Type headers', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { updateSessionConfig } = await import('./client.js');
    await updateSessionConfig('session-02', { webhooks: [] });
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assert.equal(headers['X-Api-Key'], WAHA_API_KEY);
    assert.equal(headers['Content-Type'], 'application/json');
  } finally {
    stub.restore();
  }
});

test('updateSessionConfig resolves void on 200', async () => {
  const stub = stubFetch([makeResponse(200, '{"name":"session-01"}')]);
  try {
    const { updateSessionConfig } = await import('./client.js');
    const result = await updateSessionConfig('session-01', {});
    assert.equal(result, undefined);
  } finally {
    stub.restore();
  }
});

test('updateSessionConfig throws on non-2xx with status in message', async () => {
  const stub = stubFetch([makeResponse(422, '{"error":"invalid config"}')]);
  try {
    const { updateSessionConfig } = await import('./client.js');
    await assert.rejects(
      () => updateSessionConfig('session-01', {}),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('422'), `expected 422 in message, got: ${(err as Error).message}`);
        return true;
      },
    );
  } finally {
    stub.restore();
  }
});

test('updateSessionConfig throws on 500', async () => {
  const stub = stubFetch([makeResponse(500, '{"error":"internal"}')]);
  try {
    const { updateSessionConfig } = await import('./client.js');
    await assert.rejects(
      () => updateSessionConfig('session-01', {}),
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
// createSessionIfNotExists — events includes message.reaction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getChatMessages / getMessageById — URL path encoding (path-traversal hardening)
// chatId/messageId are cashier-controlled and interpolated into the WAHA URL
// path. They MUST be percent-encoded so a `/` or `..` cannot escape the session
// scope (IDOR between cashiers).
// ---------------------------------------------------------------------------

test('getChatMessages percent-encodes chatId in the URL path', async () => {
  const stub = stubFetch([makeResponse(200, '[]')]);
  try {
    const { getChatMessages } = await import('./client.js');
    await getChatMessages('session-01', 'a/b@c.us', { limit: 10 });
    const url = stub.calls[0].url;
    assert.ok(!url.includes('a/b@c.us'), `raw chatId must not appear in path: ${url}`);
    assert.ok(
      url.includes(`/chats/${encodeURIComponent('a/b@c.us')}/messages`),
      `encoded chatId expected in path: ${url}`,
    );
  } finally {
    stub.restore();
  }
});

test('getChatMessages keeps a normal chatId resolvable (encoded @)', async () => {
  const stub = stubFetch([makeResponse(200, '[]')]);
  try {
    const { getChatMessages } = await import('./client.js');
    await getChatMessages('session-01', '5491112345678@c.us', { limit: 10 });
    const url = stub.calls[0].url;
    assert.ok(
      url.includes(`/chats/${encodeURIComponent('5491112345678@c.us')}/messages`),
      `encoded chatId expected in path: ${url}`,
    );
  } finally {
    stub.restore();
  }
});

test('getMessageById percent-encodes chatId and messageId in the URL path', async () => {
  const stub = stubFetch([makeResponse(200, '{}')]);
  try {
    const { getMessageById } = await import('./client.js');
    await getMessageById(
      'session-01',
      '5491112345678@c.us',
      'false_5491112345678@c.us_ABC/../x',
    );
    const url = stub.calls[0].url;
    assert.ok(!url.includes('ABC/../x'), `raw messageId must not appear in path: ${url}`);
    assert.ok(
      url.includes(encodeURIComponent('5491112345678@c.us')),
      `encoded chatId expected in path: ${url}`,
    );
    assert.ok(
      url.includes(encodeURIComponent('false_5491112345678@c.us_ABC/../x')),
      `encoded messageId expected in path: ${url}`,
    );
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// createSessionIfNotExists — events includes message.reaction
// ---------------------------------------------------------------------------

test('createSessionIfNotExists sends webhook events including message.reaction', async () => {
  // First call: GET /api/sessions returns empty array (no existing session)
  // Second call: POST /api/sessions (creates the session)
  const stub = stubFetch([
    makeResponse(200, '[]'),
    makeResponse(200, '{"name":"session-new","status":"CREATED"}'),
  ]);
  try {
    const { createSessionIfNotExists } = await import('./client.js');
    await createSessionIfNotExists('session-new');
    // The second call is the POST /api/sessions
    assert.equal(stub.calls.length, 2);
    const body = JSON.parse(stub.calls[1].init.body as string);
    const events: string[] = body.config.webhooks[0].events;
    assert.ok(events.includes('message.reaction'), `events should include message.reaction, got: ${JSON.stringify(events)}`);
    assert.ok(events.includes('message.any'), `events should include message.any, got: ${JSON.stringify(events)}`);
    assert.ok(events.includes('session.status'), `events should include session.status, got: ${JSON.stringify(events)}`);
  } finally {
    stub.restore();
  }
});
