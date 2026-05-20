/**
 * chat-fanout.test.ts
 *
 * Strict TDD — RED phase first. Tests for createChatMessageFanout and
 * createChatReactionFanout. Written BEFORE the implementation exists.
 *
 * Tests cover:
 * CF.1  createChatMessageFanout — known sessionName → resolves, builds event, calls publishChatMessage once
 * CF.2  createChatMessageFanout — session NOT found → warns, no publish, no throw
 * CF.3  createChatMessageFanout — repository throws → caught+logged, no throw
 * CF.4  createChatMessageFanout — reactions is [] and timestamp defaults when absent
 * CF.5  createChatReactionFanout — known sessionName → builds ChatReactionEvent, calls publishChatReaction
 * CF.6  createChatReactionFanout — session not found → warn, no publish, no throw
 */

// ---------------------------------------------------------------------------
// Env stubs — MUST come before any project module imports
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
process.env.WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL ?? 'http://localhost:3002/webhook';
process.env.WAHA_WEBHOOK_EVENTS = process.env.WAHA_WEBHOOK_EVENTS ?? 'message.any,session.status';
process.env.WAHA_WEBHOOK_TOKEN_HEADER =
  process.env.WAHA_WEBHOOK_TOKEN_HEADER ?? 'x-webhook-token';
process.env.WAHA_WEBHOOK_TOKEN_VALUE = process.env.WAHA_WEBHOOK_TOKEN_VALUE ?? 'token';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? '1234567890123456';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? '12345678901234567890123456789012';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
process.env.META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChatMessageFanout,
  createChatReactionFanout,
  type ChatFanoutDeps,
} from './chat-fanout.js';
import type { ChatMessageEvent, ChatReactionEvent } from './chat.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeSession = { id: string; cashierId: string; sessionName: string };

function makeSession(overrides: Partial<FakeSession> = {}): FakeSession {
  return {
    id: 'session-db-id-1',
    cashierId: 'cashier-id-1',
    sessionName: 'my-session',
    ...overrides,
  };
}

function makeLogger() {
  const warnCalls: unknown[][] = [];
  const errorCalls: unknown[][] = [];
  return {
    warn: (...args: unknown[]) => { warnCalls.push(args); },
    error: (...args: unknown[]) => { errorCalls.push(args); },
    info: (...args: unknown[]) => { void args; },
    _warnCalls: warnCalls,
    _errorCalls: errorCalls,
  };
}

function makeDeps(overrides: Partial<ChatFanoutDeps> = {}): ChatFanoutDeps {
  const session = makeSession();
  return {
    getSessionBySessionName: async (_sessionName: string) => session,
    publishChatMessage: (_event: ChatMessageEvent) => { /* noop */ },
    publishChatReaction: (_event: ChatReactionEvent) => { /* noop */ },
    logger: makeLogger(),
    ...overrides,
  };
}

// ===========================================================================
// createChatMessageFanout
// ===========================================================================

describe('createChatMessageFanout', () => {
  describe('CF.1 — known sessionName: resolves, builds event, calls publishChatMessage once', () => {
    it('publishes ChatMessageEvent with correct cashierId, sessionId, sessionName, chatId, message', async () => {
      const publishedEvents: ChatMessageEvent[] = [];
      const session = makeSession({ id: 'sess-db-001', cashierId: 'cashier-001', sessionName: 'sess-001' });
      const deps = makeDeps({
        getSessionBySessionName: async () => session,
        publishChatMessage: (event) => { publishedEvents.push(event); },
      });

      const fanout = createChatMessageFanout(deps);
      await fanout({
        sessionName: 'sess-001',
        chatId: '5491112345678@c.us',
        messageId: 'msg-abc',
        timestamp: 1716000000,
        body: 'Hello world',
        fromMe: false,
        hasMedia: false,
        mediaMimetype: null,
        quotedMessage: null,
      });

      assert.equal(publishedEvents.length, 1);
      const event = publishedEvents[0];
      assert.equal(event.cashierId, 'cashier-001');
      assert.equal(event.sessionId, 'sess-db-001');
      assert.equal(event.sessionName, 'sess-001');
      assert.equal(event.chatId, '5491112345678@c.us');
      assert.equal(event.message.id, 'msg-abc');
      assert.equal(event.message.body, 'Hello world');
      assert.equal(event.message.fromMe, false);
      assert.equal(event.message.hasMedia, false);
      assert.equal(event.message.timestamp, 1716000000);
    });

    it('passes hasMedia=true and mediaMimetype through to the message', async () => {
      const publishedEvents: ChatMessageEvent[] = [];
      const deps = makeDeps({
        publishChatMessage: (event) => { publishedEvents.push(event); },
      });

      const fanout = createChatMessageFanout(deps);
      await fanout({
        sessionName: 'my-session',
        chatId: 'chat-001@c.us',
        messageId: 'msg-media-1',
        timestamp: 1716100000,
        body: '',
        fromMe: false,
        hasMedia: true,
        mediaMimetype: 'image/jpeg',
        quotedMessage: null,
      });

      assert.equal(publishedEvents.length, 1);
      assert.equal(publishedEvents[0].message.hasMedia, true);
      assert.equal(publishedEvents[0].message.mediaMimetype, 'image/jpeg');
    });
  });

  describe('CF.2 — session NOT found: logs warn, does NOT call publishChatMessage, does NOT throw', () => {
    it('warns with chat_fanout_session_not_found and does not publish', async () => {
      const publishedEvents: ChatMessageEvent[] = [];
      const logger = makeLogger();
      const deps = makeDeps({
        getSessionBySessionName: async () => null,
        publishChatMessage: (event) => { publishedEvents.push(event); },
        logger,
      });

      const fanout = createChatMessageFanout(deps);
      await assert.doesNotReject(async () =>
        fanout({
          sessionName: 'unknown-session',
          chatId: 'chat-x@c.us',
          messageId: 'msg-x',
          body: 'hi',
          fromMe: false,
          hasMedia: false,
        })
      );

      assert.equal(publishedEvents.length, 0);
      const warned = logger._warnCalls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('chat_fanout_session_not_found'))
      );
      assert.ok(warned, 'Expected warn call containing chat_fanout_session_not_found');
    });
  });

  describe('CF.3 — repository lookup throws: caught+logged, does NOT throw', () => {
    it('swallows repository error and does not publish', async () => {
      const publishedEvents: ChatMessageEvent[] = [];
      const logger = makeLogger();
      const deps = makeDeps({
        getSessionBySessionName: async () => { throw new Error('DB connection failed'); },
        publishChatMessage: (event) => { publishedEvents.push(event); },
        logger,
      });

      const fanout = createChatMessageFanout(deps);
      await assert.doesNotReject(async () =>
        fanout({
          sessionName: 'any-session',
          chatId: 'chat-y@c.us',
          messageId: 'msg-y',
          body: 'test',
          fromMe: false,
          hasMedia: false,
        })
      );

      assert.equal(publishedEvents.length, 0);
      // Error should be logged (warn or error level)
      const logged = logger._warnCalls.length > 0 || logger._errorCalls.length > 0;
      assert.ok(logged, 'Expected some error/warn logging when repository throws');
    });
  });

  describe('CF.4 — reactions is [] and timestamp defaults when absent', () => {
    it('emits reactions: [] even though processor does not provide reactions', async () => {
      const publishedEvents: ChatMessageEvent[] = [];
      const deps = makeDeps({
        publishChatMessage: (event) => { publishedEvents.push(event); },
      });

      const fanout = createChatMessageFanout(deps);
      await fanout({
        sessionName: 'my-session',
        chatId: 'chat-z@c.us',
        messageId: 'msg-z',
        body: 'no reactions',
        fromMe: true,
        hasMedia: false,
        // No timestamp provided
      });

      assert.equal(publishedEvents.length, 1);
      const msg = publishedEvents[0].message;
      assert.deepEqual(msg.reactions, []);
    });

    it('uses Date.now() as default timestamp when timestamp is absent', async () => {
      const publishedEvents: ChatMessageEvent[] = [];
      const before = Date.now();
      const deps = makeDeps({
        publishChatMessage: (event) => { publishedEvents.push(event); },
      });

      const fanout = createChatMessageFanout(deps);
      await fanout({
        sessionName: 'my-session',
        chatId: 'chat-ts@c.us',
        messageId: 'msg-ts',
        body: 'no timestamp',
        fromMe: false,
        hasMedia: false,
        // No timestamp
      });

      const after = Date.now();
      assert.equal(publishedEvents.length, 1);
      const ts = publishedEvents[0].message.timestamp;
      assert.ok(ts >= before, `timestamp ${ts} should be >= ${before}`);
      assert.ok(ts <= after, `timestamp ${ts} should be <= ${after}`);
    });

    it('passes quotedMessage through when provided', async () => {
      const publishedEvents: ChatMessageEvent[] = [];
      const deps = makeDeps({
        publishChatMessage: (event) => { publishedEvents.push(event); },
      });

      const fanout = createChatMessageFanout(deps);
      await fanout({
        sessionName: 'my-session',
        chatId: 'chat-qm@c.us',
        messageId: 'msg-qm',
        body: 'quoted reply',
        fromMe: false,
        hasMedia: false,
        quotedMessage: { id: 'orig-msg-id', body: 'original body', fromMe: true },
      });

      assert.equal(publishedEvents.length, 1);
      const qm = publishedEvents[0].message.quotedMessage;
      assert.ok(qm !== null);
      assert.equal(qm?.id, 'orig-msg-id');
    });
  });
});

// ===========================================================================
// createChatReactionFanout
// ===========================================================================

describe('createChatReactionFanout', () => {
  describe('CF.5 — known sessionName: builds ChatReactionEvent, calls publishChatReaction', () => {
    it('publishes ChatReactionEvent with correct fields', async () => {
      const publishedEvents: ChatReactionEvent[] = [];
      const session = makeSession({ id: 'sess-db-002', cashierId: 'cashier-002', sessionName: 'sess-002' });
      const deps = makeDeps({
        getSessionBySessionName: async () => session,
        publishChatReaction: (event) => { publishedEvents.push(event); },
      });

      const fanout = createChatReactionFanout(deps);
      await fanout({
        sessionName: 'sess-002',
        chatId: '5498887776655@c.us',
        messageId: 'false_5498887776655@c.us_target-msg-001',
        reaction: '👍',
        fromMe: false,
      });

      assert.equal(publishedEvents.length, 1);
      const event = publishedEvents[0];
      assert.equal(event.cashierId, 'cashier-002');
      assert.equal(event.sessionId, 'sess-db-002');
      assert.equal(event.sessionName, 'sess-002');
      assert.equal(event.chatId, '5498887776655@c.us');
      assert.equal(event.messageId, 'false_5498887776655@c.us_target-msg-001');
      assert.equal(event.emoji, '👍');
      assert.equal(event.fromMe, false);
    });

    it('handles empty emoji (reaction removed)', async () => {
      const publishedEvents: ChatReactionEvent[] = [];
      const deps = makeDeps({
        publishChatReaction: (event) => { publishedEvents.push(event); },
      });

      const fanout = createChatReactionFanout(deps);
      await fanout({
        sessionName: 'my-session',
        chatId: 'chat-remove@c.us',
        messageId: 'msg-to-unreact',
        reaction: '', // removed
        fromMe: true,
      });

      assert.equal(publishedEvents.length, 1);
      assert.equal(publishedEvents[0].emoji, '');
    });
  });

  describe('CF.6 — session not found: logs warn, no publish, no throw', () => {
    it('warns and does not publish when session not found', async () => {
      const publishedEvents: ChatReactionEvent[] = [];
      const logger = makeLogger();
      const deps = makeDeps({
        getSessionBySessionName: async () => null,
        publishChatReaction: (event) => { publishedEvents.push(event); },
        logger,
      });

      const fanout = createChatReactionFanout(deps);
      await assert.doesNotReject(async () =>
        fanout({
          sessionName: 'ghost-session',
          chatId: 'chat-ghost@c.us',
          messageId: 'msg-ghost',
          reaction: '❤️',
          fromMe: false,
        })
      );

      assert.equal(publishedEvents.length, 0);
      const warned = logger._warnCalls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('chat_fanout_session_not_found'))
      );
      assert.ok(warned, 'Expected warn with chat_fanout_session_not_found');
    });

    it('swallows repository error, does not publish, does not throw', async () => {
      const publishedEvents: ChatReactionEvent[] = [];
      const logger = makeLogger();
      const deps = makeDeps({
        getSessionBySessionName: async () => { throw new Error('timeout'); },
        publishChatReaction: (event) => { publishedEvents.push(event); },
        logger,
      });

      const fanout = createChatReactionFanout(deps);
      await assert.doesNotReject(async () =>
        fanout({
          sessionName: 'any-session',
          chatId: 'chat-err@c.us',
          messageId: 'msg-err',
          reaction: '🔥',
          fromMe: true,
        })
      );

      assert.equal(publishedEvents.length, 0);
    });
  });
});
