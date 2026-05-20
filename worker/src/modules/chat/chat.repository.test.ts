/**
 * chat.repository.test.ts
 *
 * Tests for the chat repository — thin WAHA-delegating layer.
 * Written FIRST (RED) before implementation exists.
 *
 * All WAHA client functions are injected as mocks so no real HTTP is made.
 * Shapes follow the REAL WAHA GOWS 2026.3.4 shapes captured in batch-0-shapes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createChatRepository } from './chat.repository.js';
import type { ChatRepositoryDeps } from './chat.repository.js';

// ── WAHA shape builders ────────────────────────────────────────────────────────

function makeWahaChat(overrides: Record<string, unknown> = {}) {
  return {
    id: '5491112345678@c.us',
    name: 'Test Contact',
    conversationTimestamp: 1_700_000_100,
    ...overrides,
  };
}

function makeWahaMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'false_5491112345678@c.us_AABBCCDD1234',
    timestamp: 1_700_000_000,
    from: '5491112345678@c.us',
    fromMe: false,
    body: 'Hello',
    hasMedia: false,
    media: null,
    reactions: [],
    replyTo: null,
    ...overrides,
  };
}

// ── default mock deps ──────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ChatRepositoryDeps> = {}): ChatRepositoryDeps {
  return {
    listChats: async () => [],
    getChatMessages: async () => [],
    downloadMedia: async () => ({ buffer: Buffer.alloc(0), mimetype: 'application/octet-stream' }),
    sendText: async () => {},
    sendImage: async () => {},
    sendReaction: async () => {},
    ...overrides,
  };
}

// ── listChats ──────────────────────────────────────────────────────────────────

describe('chat.repository — listChats', () => {
  it('maps WAHA ChatListEntry to domain ChatListEntry', async () => {
    const deps = makeDeps({
      listChats: async () => [
        makeWahaChat({ id: 'chat1@c.us', name: 'Alice', conversationTimestamp: 1_700_000_200 }),
      ],
    });

    const repo = createChatRepository(deps);
    const result = await repo.listChats('session-name');

    assert.equal(result.length, 1);
    assert.equal(result[0].chatId, 'chat1@c.us');
    assert.equal(result[0].displayName, 'Alice');
    assert.equal(result[0].lastMessageTimestamp, 1_700_000_200);
  });

  it('sorts chats descending by lastMessageTimestamp', async () => {
    const deps = makeDeps({
      listChats: async () => [
        makeWahaChat({ id: 'old@c.us', conversationTimestamp: 100 }),
        makeWahaChat({ id: 'new@c.us', conversationTimestamp: 999 }),
        makeWahaChat({ id: 'mid@c.us', conversationTimestamp: 500 }),
      ],
    });

    const repo = createChatRepository(deps);
    const result = await repo.listChats('session-name');

    assert.equal(result[0].chatId, 'new@c.us');
    assert.equal(result[1].chatId, 'mid@c.us');
    assert.equal(result[2].chatId, 'old@c.us');
  });

  it('handles null name with null displayName', async () => {
    const deps = makeDeps({
      listChats: async () => [makeWahaChat({ name: null })],
    });

    const repo = createChatRepository(deps);
    const [entry] = await repo.listChats('session-name');
    assert.equal(entry.displayName, null);
  });

  it('handles missing conversationTimestamp with 0', async () => {
    const deps = makeDeps({
      listChats: async () => [makeWahaChat({ conversationTimestamp: undefined })],
    });

    const repo = createChatRepository(deps);
    const [entry] = await repo.listChats('session-name');
    assert.equal(entry.lastMessageTimestamp, 0);
  });

  it('passes sessionName to WAHA listChats', async () => {
    let capturedSession = '';
    const deps = makeDeps({
      listChats: async (session) => {
        capturedSession = session;
        return [];
      },
    });

    const repo = createChatRepository(deps);
    await repo.listChats('my-special-session');
    assert.equal(capturedSession, 'my-special-session');
  });
});

// ── getChatHistory ────────────────────────────────────────────────────────────

describe('chat.repository — getChatHistory', () => {
  it('maps a plain text WAHA message to ChatMessage', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [makeWahaMessage({ id: 'msg-1', body: 'Hi', timestamp: 1_700_000_001 })],
    });

    const repo = createChatRepository(deps);
    const messages = await repo.getChatHistory('session', 'chat@c.us', { limit: 20 });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, 'msg-1');
    assert.equal(messages[0].body, 'Hi');
    assert.equal(messages[0].timestamp, 1_700_000_001);
    assert.equal(messages[0].fromMe, false);
    assert.equal(messages[0].hasMedia, false);
    assert.equal(messages[0].mediaMimetype, null);
    assert.deepEqual(messages[0].reactions, []);
    assert.equal(messages[0].quotedMessage, null);
  });

  it('maps WAHA reactions to ChatMessage.reactions (real GOWS reaction shape)', async () => {
    // Real WAHA GOWS reaction shape has `text` field (not `emoji`)
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({
          id: 'msg-r',
          reactions: [
            { text: '👍', fromMe: true },
            { text: '❤️', fromMe: false },
          ],
        }),
      ],
    });

    const repo = createChatRepository(deps);
    const [msg] = await repo.getChatHistory('session', 'chat@c.us', { limit: 20 });

    assert.equal(msg.reactions.length, 2);
    assert.equal(msg.reactions[0].emoji, '👍');
    assert.equal(msg.reactions[0].fromMe, true);
    assert.equal(msg.reactions[1].emoji, '❤️');
    assert.equal(msg.reactions[1].fromMe, false);
  });

  it('maps WAHA replyTo to ChatMessage.quotedMessage', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({
          id: 'msg-q',
          replyTo: {
            id: 'quoted-id',
            body: 'Original text',
            fromMe: true,
          },
        }),
      ],
    });

    const repo = createChatRepository(deps);
    const [msg] = await repo.getChatHistory('session', 'chat@c.us', { limit: 20 });

    assert.ok(msg.quotedMessage, 'quotedMessage should be populated');
    assert.equal(msg.quotedMessage!.id, 'quoted-id');
    assert.equal(msg.quotedMessage!.previewText, 'Original text');
    assert.equal(msg.quotedMessage!.fromMe, true);
  });

  it('maps a media message to hasMedia=true + mediaMimetype from message.media', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({
          id: 'msg-media',
          hasMedia: true,
          media: { url: 'http://waha/api/s3/some-key', mimetype: 'image/jpeg' },
        }),
      ],
    });

    const repo = createChatRepository(deps);
    const [msg] = await repo.getChatHistory('session', 'chat@c.us', { limit: 20 });

    assert.equal(msg.hasMedia, true);
    assert.equal(msg.mediaMimetype, 'image/jpeg');
  });

  it('passes limit and before to WAHA getChatMessages', async () => {
    let capturedArgs: unknown = null;
    const deps = makeDeps({
      getChatMessages: async (session, chatId, opts) => {
        capturedArgs = { session, chatId, opts };
        return [];
      },
    });

    const repo = createChatRepository(deps);
    await repo.getChatHistory('sess', 'chat@c.us', { limit: 15, before: 'msg-cursor' });

    assert.ok(capturedArgs);
    const args = capturedArgs as { session: string; chatId: string; opts: Record<string, unknown> };
    assert.equal(args.session, 'sess');
    assert.equal(args.chatId, 'chat@c.us');
    assert.equal(args.opts.limit, 15);
  });

  it('handles missing reactions field gracefully (defaults to [])', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [makeWahaMessage({ reactions: undefined })],
    });

    const repo = createChatRepository(deps);
    const [msg] = await repo.getChatHistory('session', 'chat@c.us', { limit: 20 });
    assert.deepEqual(msg.reactions, []);
  });
});

// ── getMediaBytes ─────────────────────────────────────────────────────────────

describe('chat.repository — getMediaBytes', () => {
  it('returns bytes + mimetype from message metadata (not from downloadMedia response header)', async () => {
    const expectedBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({
          id: 'media-msg',
          hasMedia: true,
          media: { url: 'http://waha/api/s3/key', mimetype: 'image/png' },
        }),
      ],
      // downloadMedia returns application/octet-stream — must NOT be used for mimetype
      downloadMedia: async () => ({ buffer: expectedBytes, mimetype: 'application/octet-stream' }),
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'media-msg');

    assert.ok(result, 'should return a result');
    assert.deepEqual(result!.bytes, expectedBytes);
    // mimetype should come from message metadata (image/png), NOT from downloadMedia (octet-stream)
    assert.equal(result!.mimetype, 'image/png');
  });

  it('returns null when message is not found in WAHA response', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({ id: 'different-msg' }),
      ],
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'target-msg');
    assert.equal(result, null);
  });

  it('returns null when message has no media', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({ id: 'no-media-msg', hasMedia: false, media: null }),
      ],
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'no-media-msg');
    assert.equal(result, null);
  });

  it('returns null when media URL is null (media not yet available)', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({
          id: 'no-url-msg',
          hasMedia: true,
          media: { url: null, mimetype: 'image/jpeg' },
        }),
      ],
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'no-url-msg');
    assert.equal(result, null);
  });

  it('returns null when downloadMedia throws (R2 deletion gap)', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({
          id: 'gone-msg',
          hasMedia: true,
          media: { url: 'http://waha/api/s3/gone', mimetype: 'image/png' },
        }),
      ],
      downloadMedia: async () => {
        throw new Error('WAHA downloadMedia failed with status 404');
      },
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'gone-msg');
    assert.equal(result, null);
  });
});

// ── send pass-throughs ────────────────────────────────────────────────────────

describe('chat.repository — send pass-throughs', () => {
  it('sendText passes sessionName, chatId, text, replyTo to WAHA', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      sendText: async (session, chatId, text, replyTo) => {
        captured = { session, chatId, text, replyTo };
      },
    });

    const repo = createChatRepository(deps);
    await repo.sendText('sess', 'chat@c.us', 'hello', 'reply-id');

    const args = captured as { session: string; chatId: string; text: string; replyTo?: string };
    assert.equal(args.session, 'sess');
    assert.equal(args.chatId, 'chat@c.us');
    assert.equal(args.text, 'hello');
    assert.equal(args.replyTo, 'reply-id');
  });

  it('sendImage passes sessionName, chatId, file, caption to WAHA', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      sendImage: async (session, chatId, file, caption) => {
        captured = { session, chatId, file, caption };
      },
    });

    const repo = createChatRepository(deps);
    const file = { data: 'base64data', mimetype: 'image/jpeg' };
    await repo.sendImage('sess', 'chat@c.us', file, 'a caption');

    const args = captured as { session: string; chatId: string; file: unknown; caption?: string };
    assert.equal(args.session, 'sess');
    assert.equal(args.chatId, 'chat@c.us');
    assert.deepEqual(args.file, file);
    assert.equal(args.caption, 'a caption');
  });

  it('sendReaction passes sessionName, messageId, reaction to WAHA', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      sendReaction: async (session, messageId, reaction) => {
        captured = { session, messageId, reaction };
      },
    });

    const repo = createChatRepository(deps);
    await repo.sendReaction('sess', 'msg-id-serialized', '👍');

    const args = captured as { session: string; messageId: string; reaction: string };
    assert.equal(args.session, 'sess');
    assert.equal(args.messageId, 'msg-id-serialized');
    assert.equal(args.reaction, '👍');
  });

  it('sendReaction passes empty string for reaction removal', async () => {
    let capturedReaction = 'NOT_SET';
    const deps = makeDeps({
      sendReaction: async (_session, _messageId, reaction) => {
        capturedReaction = reaction;
      },
    });

    const repo = createChatRepository(deps);
    await repo.sendReaction('sess', 'msg-id', '');
    assert.equal(capturedReaction, '');
  });
});
