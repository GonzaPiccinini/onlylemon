/**
 * chat.controller.test.ts
 *
 * Unit tests for the chat HTTP controller.
 * Written FIRST (RED) per strict TDD.
 *
 * Strategy: inject a mock ChatService — avoids hitting DB or WAHA.
 * Each handler is called directly with fake req/res objects.
 *
 * ES module mock limitations apply (Cannot redefine read-only exports),
 * so we use the factory pattern: createChatController(mockService).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Env bootstrap
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
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

import { createChatController } from './chat.controller.js';
import {
  ChatForbiddenError,
  ChatRateLimitError,
  ChatSessionNotFoundError,
} from './chat.service.js';
import type { ChatService } from './chat.service.js';
import type { ChatListEntry, ChatMessage } from './chat.types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

type FakeRes = {
  statusCode: number;
  body: unknown;
  _headers: Record<string, string>;
  status: (code: number) => FakeRes;
  json: (data: unknown) => FakeRes;
  send: (data?: unknown) => FakeRes;
  set: (header: string, value: string) => FakeRes;
  end: () => FakeRes;
};

function makeRes(): FakeRes {
  let _statusCode = 200;
  const res: FakeRes = {
    statusCode: 0,
    body: null,
    _headers: {},
    status(code) {
      _statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      res.statusCode = _statusCode;
      return res;
    },
    send(data) {
      res.body = data;
      res.statusCode = _statusCode;
      return res;
    },
    set(header, value) {
      res._headers[header] = value;
      return res;
    },
    end() {
      res.statusCode = _statusCode;
      return res;
    },
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    authUser: { role: 'CASHIER', cashierId: 'cashier-1', userId: 'user-1' },
    params: { sessionId: 'session-uuid-1', chatId: 'chat@c.us', messageId: 'msg-001' },
    query: {},
    body: {},
    resolvedSession: { id: 'session-uuid-1', sessionName: 'test-session', cashierId: 'cashier-1' },
    ...overrides,
  } as unknown as import('express').Request;
}

function makeChatListEntry(overrides: Partial<ChatListEntry> = {}): ChatListEntry {
  return {
    chatId: 'chat@c.us',
    displayName: 'Test Contact',
    lastMessageTimestamp: 1_700_000_000,
    ...overrides,
  };
}

function makeChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-001',
    timestamp: 1_700_000_000,
    fromMe: false,
    body: 'Hello',
    hasMedia: false,
    mediaMimetype: null,
    reactions: [],
    quotedMessage: null,
    ...overrides,
  };
}

function makeMockService(overrides: Partial<ChatService> = {}): ChatService {
  return {
    listChats: async () => [makeChatListEntry()],
    getChatHistory: async () => [makeChatMessage()],
    sendText: async () => {},
    sendPhoto: async () => {},
    sendReaction: async () => {},
    getMediaBytes: async () => ({ bytes: Buffer.from('image-bytes'), mimetype: 'image/jpeg' }),
    ...overrides,
  };
}

// ── listChats ─────────────────────────────────────────────────────────────────

describe('chat.controller — listChats', () => {
  it('returns 200 with chat list on happy path', async () => {
    const svc = makeMockService();
    const { listChats } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();
    await listChats(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      listChats: async () => { throw new ChatForbiddenError(); },
    });
    const { listChats } = createChatController(svc);

    const res = makeRes();
    await listChats(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('returns 404 on ChatSessionNotFoundError', async () => {
    const svc = makeMockService({
      listChats: async () => { throw new ChatSessionNotFoundError('session-uuid-1'); },
    });
    const { listChats } = createChatController(svc);

    const res = makeRes();
    await listChats(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
  });
});

// ── getChatHistory ────────────────────────────────────────────────────────────

describe('chat.controller — getChatHistory', () => {
  it('returns 200 with message list on happy path', async () => {
    const svc = makeMockService();
    const { getChatHistory } = createChatController(svc);

    const req = makeReq({ query: { limit: '10' } });
    const res = makeRes();
    await getChatHistory(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      getChatHistory: async () => { throw new ChatForbiddenError(); },
    });
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('returns 404 on ChatSessionNotFoundError', async () => {
    const svc = makeMockService({
      getChatHistory: async () => { throw new ChatSessionNotFoundError('x'); },
    });
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
  });

  it('coerces limit query param from string to number and defaults to 30', async () => {
    let capturedLimit: number | undefined;
    const svc = makeMockService({
      getChatHistory: async (args) => {
        capturedLimit = args.limit;
        return [];
      },
    });
    const { getChatHistory } = createChatController(svc);

    // no limit in query — should default to 30
    const res = makeRes();
    await getChatHistory(makeReq({ query: {} }), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.equal(capturedLimit, 30);
  });

  it('coerces string limit to integer', async () => {
    let capturedLimit: number | undefined;
    const svc = makeMockService({
      getChatHistory: async (args) => {
        capturedLimit = args.limit;
        return [];
      },
    });
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ query: { limit: '50' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(capturedLimit, 50);
  });

  it('returns 400 when limit exceeds 100', async () => {
    const svc = makeMockService();
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ query: { limit: '200' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
  });

  it('returns 400 when limit is below 1', async () => {
    const svc = makeMockService();
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ query: { limit: '0' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
  });

  it('forwards optional before cursor to service', async () => {
    let capturedBefore: string | undefined;
    const svc = makeMockService({
      getChatHistory: async (args) => {
        capturedBefore = args.before;
        return [];
      },
    });
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ query: { before: 'cursor-abc' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(capturedBefore, 'cursor-abc');
  });
});

// ── sendText ──────────────────────────────────────────────────────────────────

describe('chat.controller — sendText', () => {
  it('returns 200 on happy path', async () => {
    const svc = makeMockService();
    const { sendText } = createChatController(svc);

    const req = makeReq({ body: { text: 'hello' } });
    const res = makeRes();
    await sendText(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
  });

  it('returns 400 when body is missing text', async () => {
    const svc = makeMockService();
    const { sendText } = createChatController(svc);

    const req = makeReq({ body: {} });
    const res = makeRes();
    await sendText(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 400 when text is empty string', async () => {
    const svc = makeMockService();
    const { sendText } = createChatController(svc);

    const req = makeReq({ body: { text: '' } });
    const res = makeRes();
    await sendText(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('accepts optional replyTo field', async () => {
    let capturedReplyTo: string | undefined;
    const svc = makeMockService({
      sendText: async (args) => { capturedReplyTo = args.replyTo; },
    });
    const { sendText } = createChatController(svc);

    const req = makeReq({ body: { text: 'reply', replyTo: 'msg-quoted-id' } });
    const res = makeRes();
    await sendText(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.equal(capturedReplyTo, 'msg-quoted-id');
  });

  it('returns 429 on ChatRateLimitError', async () => {
    const svc = makeMockService({
      sendText: async () => { throw new ChatRateLimitError(); },
    });
    const { sendText } = createChatController(svc);

    const req = makeReq({ body: { text: 'hello' } });
    const res = makeRes();
    await sendText(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 429);
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      sendText: async () => { throw new ChatForbiddenError(); },
    });
    const { sendText } = createChatController(svc);

    const req = makeReq({ body: { text: 'hello' } });
    const res = makeRes();
    await sendText(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('returns 404 on ChatSessionNotFoundError', async () => {
    const svc = makeMockService({
      sendText: async () => { throw new ChatSessionNotFoundError('x'); },
    });
    const { sendText } = createChatController(svc);

    const req = makeReq({ body: { text: 'hello' } });
    const res = makeRes();
    await sendText(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
  });
});

// ── sendReaction ──────────────────────────────────────────────────────────────

describe('chat.controller — sendReaction', () => {
  it('returns 200 on happy path with emoji', async () => {
    const svc = makeMockService();
    const { sendReaction } = createChatController(svc);

    const req = makeReq({ body: { reaction: '👍' } });
    const res = makeRes();
    await sendReaction(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
  });

  it('returns 200 on empty reaction (remove reaction)', async () => {
    const svc = makeMockService();
    const { sendReaction } = createChatController(svc);

    const req = makeReq({ body: { reaction: '' } });
    const res = makeRes();
    await sendReaction(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
  });

  it('returns 400 when body is missing reaction field', async () => {
    const svc = makeMockService();
    const { sendReaction } = createChatController(svc);

    const req = makeReq({ body: {} });
    const res = makeRes();
    await sendReaction(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      sendReaction: async () => { throw new ChatForbiddenError(); },
    });
    const { sendReaction } = createChatController(svc);

    const req = makeReq({ body: { reaction: '👍' } });
    const res = makeRes();
    await sendReaction(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('returns 429 on ChatRateLimitError', async () => {
    const svc = makeMockService({
      sendReaction: async () => { throw new ChatRateLimitError(); },
    });
    const { sendReaction } = createChatController(svc);

    const req = makeReq({ body: { reaction: '👍' } });
    const res = makeRes();
    await sendReaction(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 429);
  });

  it('returns 404 on ChatSessionNotFoundError', async () => {
    const svc = makeMockService({
      sendReaction: async () => { throw new ChatSessionNotFoundError('x'); },
    });
    const { sendReaction } = createChatController(svc);

    const req = makeReq({ body: { reaction: '👍' } });
    const res = makeRes();
    await sendReaction(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
  });
});

// ── getMedia ──────────────────────────────────────────────────────────────────

describe('chat.controller — getMedia', () => {
  it('returns 200 with bytes and correct Content-Type on happy path', async () => {
    const fakeBytes = Buffer.from([0xff, 0xd8, 0xff]);
    const svc = makeMockService({
      getMediaBytes: async () => ({ bytes: fakeBytes, mimetype: 'image/jpeg' }),
    });
    const { getMedia } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();

    // getMedia pipes bytes; capture via send
    await getMedia(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.equal(res._headers['Content-Type'], 'image/jpeg');
    assert.deepEqual(res.body, fakeBytes);
  });

  it('returns 404 with MEDIA_UNAVAILABLE when service returns null', async () => {
    const svc = makeMockService({
      getMediaBytes: async () => null,
    });
    const { getMedia } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();
    await getMedia(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'MEDIA_UNAVAILABLE' });
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      getMediaBytes: async () => { throw new ChatForbiddenError(); },
    });
    const { getMedia } = createChatController(svc);

    const res = makeRes();
    await getMedia(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('returns 404 on ChatSessionNotFoundError', async () => {
    const svc = makeMockService({
      getMediaBytes: async () => { throw new ChatSessionNotFoundError('x'); },
    });
    const { getMedia } = createChatController(svc);

    const res = makeRes();
    await getMedia(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
  });
});
