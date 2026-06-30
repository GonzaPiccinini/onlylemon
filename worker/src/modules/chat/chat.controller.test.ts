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
process.env.TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? 'turnstile-secret';
process.env.ALTCHA_HMAC_SECRET = process.env.ALTCHA_HMAC_SECRET ?? 'test-altcha-hmac-secret-32-bytes!';
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
import { ViewOnceMediaError } from './chat.repository.js';
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
    isViewOnce: false,
    reactions: [],
    quotedMessage: null,
    senderName: null,
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
    publishTextStatus: async () => {},
    publishImageStatus: async () => {},
    setSessionAlias: async () => {},
    setTyping: async () => {},
    markSeen: async () => {},
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

  it('forwards optional offset cursor to service', async () => {
    let capturedOffset: number | undefined;
    const svc = makeMockService({
      getChatHistory: async (args) => {
        capturedOffset = args.offset;
        return [];
      },
    });
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ query: { offset: '10' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(capturedOffset, 10);
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

// ── setTyping ─────────────────────────────────────────────────────────────────

describe('chat.controller — setTyping', () => {
  it('returns 200 and forwards state=start + chatId to the service', async () => {
    let captured: unknown = null;
    const svc = makeMockService({
      setTyping: async (args) => { captured = args; },
    });
    const { setTyping } = createChatController(svc);

    const req = makeReq({ body: { state: 'start' } });
    const res = makeRes();
    await setTyping(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    const args = captured as { chatId: string; state: string };
    assert.equal(args.state, 'start');
    assert.equal(args.chatId, 'chat@c.us');
  });

  it('returns 200 for state=stop', async () => {
    const svc = makeMockService();
    const { setTyping } = createChatController(svc);

    const req = makeReq({ body: { state: 'stop' } });
    const res = makeRes();
    await setTyping(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
  });

  it('returns 400 when state is missing', async () => {
    const svc = makeMockService();
    const { setTyping } = createChatController(svc);

    const req = makeReq({ body: {} });
    const res = makeRes();
    await setTyping(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 400 when state is not "start" or "stop"', async () => {
    const svc = makeMockService();
    const { setTyping } = createChatController(svc);

    const req = makeReq({ body: { state: 'composing' } });
    const res = makeRes();
    await setTyping(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 400 when chatId is invalid (no @)', async () => {
    const svc = makeMockService();
    const { setTyping } = createChatController(svc);

    const req = makeReq({
      params: { sessionId: 'session-uuid-1', chatId: 'invalid-no-at' },
      body: { state: 'start' },
    });
    const res = makeRes();
    await setTyping(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      setTyping: async () => { throw new ChatForbiddenError(); },
    });
    const { setTyping } = createChatController(svc);

    const req = makeReq({ body: { state: 'start' } });
    const res = makeRes();
    await setTyping(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('returns 404 on ChatSessionNotFoundError', async () => {
    const svc = makeMockService({
      setTyping: async () => { throw new ChatSessionNotFoundError('x'); },
    });
    const { setTyping } = createChatController(svc);

    const req = makeReq({ body: { state: 'start' } });
    const res = makeRes();
    await setTyping(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
  });
});

// ── markSeen ──────────────────────────────────────────────────────────────────

describe('chat.controller — markSeen', () => {
  it('returns 200 and forwards chatId to the service', async () => {
    let captured: unknown = null;
    const svc = makeMockService({
      markSeen: async (args) => { captured = args; },
    });
    const { markSeen } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();
    await markSeen(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    const args = captured as { chatId: string };
    assert.equal(args.chatId, 'chat@c.us');
  });

  it('returns 400 when chatId is invalid (no @)', async () => {
    const svc = makeMockService();
    const { markSeen } = createChatController(svc);

    const req = makeReq({ params: { sessionId: 'session-uuid-1', chatId: 'invalid-no-at' } });
    const res = makeRes();
    await markSeen(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      markSeen: async () => { throw new ChatForbiddenError(); },
    });
    const { markSeen } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();
    await markSeen(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('returns 404 on ChatSessionNotFoundError', async () => {
    const svc = makeMockService({
      markSeen: async () => { throw new ChatSessionNotFoundError('x'); },
    });
    const { markSeen } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();
    await markSeen(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 404);
  });
});

// ── sendPhoto ─────────────────────────────────────────────────────────────────

describe('chat.controller — sendPhoto', () => {
  // Valid JPEG buffer for tests
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  function makeReqWithFile(
    file: Express.Multer.File | undefined,
    body: Record<string, unknown> = {},
  ) {
    return makeReq({ file, body }) as unknown as import('express').Request;
  }

  it('returns 200 on happy path: valid JPEG buffer with matching magic bytes', async () => {
    let capturedFileData: unknown;
    const svc = makeMockService({
      sendPhoto: async (args) => { capturedFileData = args.file.data; },
    });
    const { sendPhoto } = createChatController(svc);

    const multerFile = {
      fieldname: 'file',
      originalname: 'test.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: jpegBuffer,
      size: jpegBuffer.length,
    } as Express.Multer.File;

    const req = makeReqWithFile(multerFile);
    const res = makeRes();
    await sendPhoto(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    // service receives base64-encoded data
    assert.equal(capturedFileData, jpegBuffer.toString('base64'));
  });

  it('returns 400 when req.file is missing', async () => {
    const svc = makeMockService();
    const { sendPhoto } = createChatController(svc);

    const req = makeReqWithFile(undefined);
    const res = makeRes();
    await sendPhoto(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 415 on magic-byte mismatch (declared jpeg, bytes are PNG)', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const svc = makeMockService();
    const { sendPhoto } = createChatController(svc);

    const multerFile = {
      fieldname: 'file',
      originalname: 'fake.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: pngBuffer, // PNG bytes but declared as jpeg
      size: pngBuffer.length,
    } as Express.Multer.File;

    const req = makeReqWithFile(multerFile);
    const res = makeRes();
    await sendPhoto(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 415);
  });

  it('returns 429 on ChatRateLimitError', async () => {
    const svc = makeMockService({
      sendPhoto: async () => { throw new ChatRateLimitError(); },
    });
    const { sendPhoto } = createChatController(svc);

    const multerFile = {
      fieldname: 'file',
      originalname: 'test.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: jpegBuffer,
      size: jpegBuffer.length,
    } as Express.Multer.File;

    const req = makeReqWithFile(multerFile);
    const res = makeRes();
    await sendPhoto(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 429);
  });

  it('returns 403 on ChatForbiddenError', async () => {
    const svc = makeMockService({
      sendPhoto: async () => { throw new ChatForbiddenError(); },
    });
    const { sendPhoto } = createChatController(svc);

    const multerFile = {
      fieldname: 'file',
      originalname: 'test.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: jpegBuffer,
      size: jpegBuffer.length,
    } as Express.Multer.File;

    const req = makeReqWithFile(multerFile);
    const res = makeRes();
    await sendPhoto(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });

  it('does NOT read replyTo from body (V2 deferral)', async () => {
    let capturedArgs: Parameters<ChatService['sendPhoto']>[0] | undefined;
    const svc = makeMockService({
      sendPhoto: async (args) => { capturedArgs = args; },
    });
    const { sendPhoto } = createChatController(svc);

    const multerFile = {
      fieldname: 'file',
      originalname: 'test.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: jpegBuffer,
      size: jpegBuffer.length,
    } as Express.Multer.File;

    const req = makeReqWithFile(multerFile, { caption: 'hi', replyTo: 'some-msg-id' });
    const res = makeRes();
    await sendPhoto(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.equal(capturedArgs?.caption, 'hi');
    // replyTo must NOT be forwarded in V1
    assert.equal(capturedArgs?.replyTo, undefined);
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

  it('returns 410 with VIEW_ONCE_UNAVAILABLE when the repo throws ViewOnceMediaError', async () => {
    const svc = makeMockService({
      getMediaBytes: async () => { throw new ViewOnceMediaError(); },
    });
    const { getMedia } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();
    await getMedia(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 410);
    assert.deepEqual(res.body, { error: 'VIEW_ONCE_UNAVAILABLE' });
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

  // W4: PDF mimetype — the handler sets Content-Type from result.mimetype
  // generically (res.set('Content-Type', result.mimetype)). This test confirms
  // the same code path works correctly for non-image types.
  it('returns 200 with application/pdf Content-Type when service returns PDF mimetype', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 fake pdf content');
    const svc = makeMockService({
      getMediaBytes: async () => ({ bytes: pdfBytes, mimetype: 'application/pdf' }),
    });
    const { getMedia } = createChatController(svc);

    const req = makeReq();
    const res = makeRes();
    await getMedia(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.equal(res._headers['Content-Type'], 'application/pdf');
    assert.deepEqual(res.body, pdfBytes);
  });
});

// ── getMedia hardening headers ──────────────────────────────────────────────────
// Incoming media bytes are proxied with a Content-Type taken from WhatsApp
// metadata (contact-controlled) and are NOT magic-byte verified. Harden the
// response so a browser cannot sniff/render it as active content.

describe('chat.controller — getMedia hardening headers', () => {
  it('sets X-Content-Type-Options: nosniff on a media response', async () => {
    const svc = makeMockService({
      getMediaBytes: async () => ({ bytes: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg' }),
    });
    const { getMedia } = createChatController(svc);

    const res = makeRes();
    await getMedia(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.equal(res._headers['X-Content-Type-Options'], 'nosniff');
  });

  it('sets Content-Disposition: attachment on a media response', async () => {
    const svc = makeMockService({
      getMediaBytes: async () => ({ bytes: Buffer.from([0xff, 0xd8, 0xff]), mimetype: 'image/jpeg' }),
    });
    const { getMedia } = createChatController(svc);

    const res = makeRes();
    await getMedia(makeReq(), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.match(res._headers['Content-Disposition'], /^attachment/);
  });
});

// ── chatId / messageId validation (path-traversal hardening) ────────────────────
// chatId/messageId reach WAHA URL paths. A cashier-supplied value containing a
// path separator or `..` segment could break out of the session scope (IDOR).
// The controller must reject these with 400 BEFORE touching the service.

describe('chat.controller — chatId/messageId validation', () => {
  it('getChatHistory returns 400 when chatId contains a path separator', async () => {
    let called = false;
    const svc = makeMockService({
      getChatHistory: async () => { called = true; return []; },
    });
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ params: { sessionId: 'session-uuid-1', chatId: '../../other/chats/x' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(called, false, 'service must not be called on invalid chatId');
  });

  it('getChatHistory returns 400 when chatId is a bare ".." segment', async () => {
    const svc = makeMockService();
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ params: { sessionId: 'session-uuid-1', chatId: '..' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
  });

  it('getMedia returns 400 when chatId contains a traversal segment', async () => {
    let called = false;
    const svc = makeMockService({
      getMediaBytes: async () => { called = true; return null; },
    });
    const { getMedia } = createChatController(svc);

    const res = makeRes();
    await getMedia(
      makeReq({ params: { sessionId: 'session-uuid-1', chatId: 'a/../b@c.us', messageId: 'msg-001' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(called, false, 'service must not be called on invalid chatId');
  });

  it('getMedia returns 400 when messageId contains a path separator', async () => {
    const svc = makeMockService();
    const { getMedia } = createChatController(svc);

    const res = makeRes();
    await getMedia(
      makeReq({ params: { sessionId: 'session-uuid-1', chatId: 'chat@c.us', messageId: '../../x' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
  });

  it('getChatHistory accepts a valid group chatId (g.us)', async () => {
    const svc = makeMockService();
    const { getChatHistory } = createChatController(svc);

    const res = makeRes();
    await getChatHistory(
      makeReq({ params: { sessionId: 'session-uuid-1', chatId: '120363000000000001@g.us' } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 200);
  });

  it('getMedia accepts a valid serialized WAHA messageId', async () => {
    const svc = makeMockService();
    const { getMedia } = createChatController(svc);

    const res = makeRes();
    await getMedia(
      makeReq({
        params: {
          sessionId: 'session-uuid-1',
          chatId: '5491112345678@c.us',
          messageId: 'false_5491112345678@c.us_3EB0ABCDEF',
        },
      }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 200);
  });
});

// ── publishTextStatus ───────────────────────────────────────────────────────────

describe('chat.controller — publishTextStatus', () => {
  it('returns 200 and delegates to service on valid payload', async () => {
    let captured: unknown = null;
    const svc = makeMockService({
      publishTextStatus: async (args) => { captured = args; },
    });
    const { publishTextStatus } = createChatController(svc);

    const req = makeReq({ body: { text: 'mi estado', backgroundColor: '#38b42f' } });
    const res = makeRes();
    await publishTextStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    const args = captured as { sessionId: string; text: string; backgroundColor?: string };
    assert.equal(args.sessionId, 'session-uuid-1');
    assert.equal(args.text, 'mi estado');
    assert.equal(args.backgroundColor, '#38b42f');
  });

  it('returns 400 on empty text', async () => {
    const svc = makeMockService();
    const { publishTextStatus } = createChatController(svc);

    const req = makeReq({ body: { text: '' } });
    const res = makeRes();
    await publishTextStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 400 on malformed backgroundColor', async () => {
    const svc = makeMockService();
    const { publishTextStatus } = createChatController(svc);

    const req = makeReq({ body: { text: 'ok', backgroundColor: 'rojo' } });
    const res = makeRes();
    await publishTextStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('maps ChatRateLimitError to 429', async () => {
    const svc = makeMockService({
      publishTextStatus: async () => { throw new ChatRateLimitError(); },
    });
    const { publishTextStatus } = createChatController(svc);

    const req = makeReq({ body: { text: 'x' } });
    const res = makeRes();
    await publishTextStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 429);
  });

  it('maps ChatForbiddenError to 403', async () => {
    const svc = makeMockService({
      publishTextStatus: async () => { throw new ChatForbiddenError(); },
    });
    const { publishTextStatus } = createChatController(svc);

    const req = makeReq({ body: { text: 'x' } });
    const res = makeRes();
    await publishTextStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });
});

// ── publishImageStatus ──────────────────────────────────────────────────────────

describe('chat.controller — publishImageStatus', () => {
  const jpegStatusBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

  function makeStatusReqWithFile(
    file: Express.Multer.File | undefined,
    body: Record<string, unknown> = {},
  ) {
    return makeReq({ file, body }) as unknown as import('express').Request;
  }

  it('returns 200 on valid JPEG and forwards base64 data + caption', async () => {
    let captured: unknown = null;
    const svc = makeMockService({
      publishImageStatus: async (args) => { captured = args; },
    });
    const { publishImageStatus } = createChatController(svc);

    const multerFile = {
      fieldname: 'file',
      originalname: 'status.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: jpegStatusBuffer,
      size: jpegStatusBuffer.length,
    } as Express.Multer.File;

    const req = makeStatusReqWithFile(multerFile, { caption: 'mi caption' });
    const res = makeRes();
    await publishImageStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    const args = captured as { file: { data: string; mimetype: string }; caption?: string };
    assert.equal(args.file.data, jpegStatusBuffer.toString('base64'));
    assert.equal(args.file.mimetype, 'image/jpeg');
    assert.equal(args.caption, 'mi caption');
  });

  it('returns 400 when file is missing', async () => {
    const svc = makeMockService();
    const { publishImageStatus } = createChatController(svc);

    const req = makeStatusReqWithFile(undefined);
    const res = makeRes();
    await publishImageStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('returns 415 on magic-byte mismatch', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const svc = makeMockService();
    const { publishImageStatus } = createChatController(svc);

    const multerFile = {
      fieldname: 'file',
      originalname: 'fake.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: pngBytes,
      size: pngBytes.length,
    } as Express.Multer.File;

    const req = makeStatusReqWithFile(multerFile);
    const res = makeRes();
    await publishImageStatus(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 415);
  });
});

// ── listChats pagination ────────────────────────────────────────────────────────

describe('chat.controller — listChats pagination', () => {
  it('forwards parsed limit/offset query to the service', async () => {
    let captured: unknown = null;
    const svc = makeMockService({
      listChats: async (args) => { captured = args; return []; },
    });
    const { listChats } = createChatController(svc);

    const req = makeReq({ query: { limit: '20', offset: '40' } });
    const res = makeRes();
    await listChats(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    const args = captured as { limit?: number; offset?: number };
    assert.equal(args.limit, 20);
    assert.equal(args.offset, 40);
  });

  it('omits limit/offset when not provided', async () => {
    let captured: unknown = null;
    const svc = makeMockService({
      listChats: async (args) => { captured = args; return []; },
    });
    const { listChats } = createChatController(svc);

    const req = makeReq({ query: {} });
    const res = makeRes();
    await listChats(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    const args = captured as { limit?: number; offset?: number };
    assert.equal(args.limit, undefined);
    assert.equal(args.offset, undefined);
  });

  it('returns 400 on invalid limit', async () => {
    const svc = makeMockService();
    const { listChats } = createChatController(svc);

    const req = makeReq({ query: { limit: 'abc' } });
    const res = makeRes();
    await listChats(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });
});

// ── input length caps (abuse / minor DoS hardening) ──────────────────────────────

describe('chat.controller — input length caps', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  function fileReq(body: Record<string, unknown>) {
    const file = {
      fieldname: 'file',
      originalname: 'a.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: jpeg,
      size: jpeg.length,
    } as Express.Multer.File;
    return makeReq({ file, body }) as unknown as import('express').Request;
  }

  it('sendText returns 400 when replyTo exceeds the max length', async () => {
    let called = false;
    const svc = makeMockService({ sendText: async () => { called = true; } });
    const { sendText } = createChatController(svc);

    const res = makeRes();
    await sendText(
      makeReq({ body: { text: 'hi', replyTo: 'x'.repeat(257) } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  });

  it('sendReaction returns 400 when reaction exceeds the max length', async () => {
    let called = false;
    const svc = makeMockService({ sendReaction: async () => { called = true; } });
    const { sendReaction } = createChatController(svc);

    const res = makeRes();
    await sendReaction(
      makeReq({ body: { reaction: 'x'.repeat(33) } }),
      res as unknown as import('express').Response,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  });

  it('sendPhoto returns 400 when caption exceeds the max length', async () => {
    let called = false;
    const svc = makeMockService({ sendPhoto: async () => { called = true; } });
    const { sendPhoto } = createChatController(svc);

    const res = makeRes();
    await sendPhoto(fileReq({ caption: 'x'.repeat(1025) }), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  });

  it('publishImageStatus returns 400 when caption exceeds the max length', async () => {
    let called = false;
    const svc = makeMockService({ publishImageStatus: async () => { called = true; } });
    const { publishImageStatus } = createChatController(svc);

    const res = makeRes();
    await publishImageStatus(fileReq({ caption: 'x'.repeat(1025) }), res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  });
});

// ── setSessionAlias ─────────────────────────────────────────────────────────────

describe('chat.controller — setSessionAlias', () => {
  it('returns 200 and forwards alias to the service', async () => {
    let captured: unknown = null;
    const svc = makeMockService({
      setSessionAlias: async (args) => { captured = args; },
    });
    const { setSessionAlias } = createChatController(svc);

    const req = makeReq({ body: { alias: 'Ventas' } });
    const res = makeRes();
    await setSessionAlias(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    const args = captured as { sessionId: string; alias: string | null };
    assert.equal(args.sessionId, 'session-uuid-1');
    assert.equal(args.alias, 'Ventas');
  });

  it('accepts null to clear the alias', async () => {
    let captured: unknown = 'UNSET';
    const svc = makeMockService({
      setSessionAlias: async (args) => { captured = args.alias; },
    });
    const { setSessionAlias } = createChatController(svc);

    const req = makeReq({ body: { alias: null } });
    const res = makeRes();
    await setSessionAlias(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 200);
    assert.equal(captured, null);
  });

  it('returns 400 when alias exceeds max length', async () => {
    const svc = makeMockService();
    const { setSessionAlias } = createChatController(svc);

    const req = makeReq({ body: { alias: 'x'.repeat(61) } });
    const res = makeRes();
    await setSessionAlias(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 400);
  });

  it('maps ChatForbiddenError to 403', async () => {
    const svc = makeMockService({
      setSessionAlias: async () => { throw new ChatForbiddenError(); },
    });
    const { setSessionAlias } = createChatController(svc);

    const req = makeReq({ body: { alias: 'x' } });
    const res = makeRes();
    await setSessionAlias(req, res as unknown as import('express').Response);

    assert.equal(res.statusCode, 403);
  });
});
