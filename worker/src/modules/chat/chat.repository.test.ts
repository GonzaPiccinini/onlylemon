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
    getMessageById: async () => null,
    downloadMedia: async () => ({ buffer: Buffer.alloc(0), mimetype: 'application/octet-stream' }),
    sendText: async () => {},
    sendImage: async () => {},
    sendReaction: async () => {},
    sendTextStatus: async () => {},
    sendImageStatus: async () => {},
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

  it('passes limit and offset to WAHA getChatMessages', async () => {
    let capturedArgs: unknown = null;
    const deps = makeDeps({
      getChatMessages: async (session, chatId, opts) => {
        capturedArgs = { session, chatId, opts };
        return [];
      },
    });

    const repo = createChatRepository(deps);
    await repo.getChatHistory('sess', 'chat@c.us', { limit: 15, offset: 30 });

    assert.ok(capturedArgs);
    const args = capturedArgs as { session: string; chatId: string; opts: Record<string, unknown> };
    assert.equal(args.session, 'sess');
    assert.equal(args.chatId, 'chat@c.us');
    assert.equal(args.opts.limit, 15);
    assert.equal(args.opts.offset, 30);
  });

  it('maps the group sender name from _data.Info.PushName for incoming group messages', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [
        makeWahaMessage({
          from: '120363427669598042@g.us',
          fromMe: false,
          participant: '47408553701472@lid',
          _data: { Info: { PushName: 'Soporte', IsGroup: true } },
        }),
      ],
    });

    const repo = createChatRepository(deps);
    const [msg] = await repo.getChatHistory('session', '120363427669598042@g.us', { limit: 20 });

    assert.equal(msg.senderName, 'Soporte');
  });

  it('leaves senderName null for 1:1 chats', async () => {
    const deps = makeDeps({
      getChatMessages: async () => [makeWahaMessage()], // default from is @c.us
    });

    const repo = createChatRepository(deps);
    const [msg] = await repo.getChatHistory('session', '5491112345678@c.us', { limit: 20 });

    assert.equal(msg.senderName, null);
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
      getMessageById: async () =>
        makeWahaMessage({
          id: 'media-msg',
          hasMedia: true,
          media: { url: 'http://waha/api/s3/key', mimetype: 'image/png' },
        }),
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

  it('fetches the target message DIRECTLY by id (not via a recent-window list scan)', async () => {
    // Regression: media on messages older than the former 50-message scan window
    // returned 404 even though WAHA had the URL. The repo must look the message
    // up by id, passing through the exact session/chat/message it was asked for.
    let captured: { session: string; chatId: string; messageId: string } | null = null;
    const deps = makeDeps({
      getMessageById: async (session, chatId, messageId) => {
        captured = { session, chatId, messageId };
        return makeWahaMessage({
          id: messageId,
          hasMedia: true,
          media: { url: 'http://waha/api/s3/old-but-present', mimetype: 'image/jpeg' },
        });
      },
      downloadMedia: async () => ({ buffer: Buffer.from([0x01]), mimetype: 'application/octet-stream' }),
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'true_old@lid_DEADBEEF');

    assert.ok(result, 'older message media should still resolve');
    assert.equal(result!.mimetype, 'image/jpeg');
    assert.deepEqual(captured, {
      session: 'session',
      chatId: 'chat@c.us',
      messageId: 'true_old@lid_DEADBEEF',
    });
  });

  it('returns null when the message is not found (WAHA returns null)', async () => {
    const deps = makeDeps({
      getMessageById: async () => null,
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'target-msg');
    assert.equal(result, null);
  });

  it('returns null when message has no media', async () => {
    const deps = makeDeps({
      getMessageById: async () =>
        makeWahaMessage({ id: 'no-media-msg', hasMedia: false, media: null }),
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'no-media-msg');
    assert.equal(result, null);
  });

  it('returns null when media URL is null (media not yet available)', async () => {
    const deps = makeDeps({
      getMessageById: async () =>
        makeWahaMessage({
          id: 'no-url-msg',
          hasMedia: true,
          media: { url: null, mimetype: 'image/jpeg' },
        }),
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'no-url-msg');
    assert.equal(result, null);
  });

  it('returns null when getMessageById throws (transient WAHA failure)', async () => {
    const deps = makeDeps({
      getMessageById: async () => {
        throw new Error('WAHA getMessageById failed with status 500');
      },
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'boom-msg');
    assert.equal(result, null);
  });

  it('returns null when downloadMedia throws (R2 deletion gap)', async () => {
    const deps = makeDeps({
      getMessageById: async () =>
        makeWahaMessage({
          id: 'gone-msg',
          hasMedia: true,
          media: { url: 'http://waha/api/s3/gone', mimetype: 'image/png' },
        }),
      downloadMedia: async () => {
        throw new Error('WAHA downloadMedia failed with status 404');
      },
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'gone-msg');
    assert.equal(result, null);
  });

  it('falls back to a chat-history scan (matched by message hash) when getMessageById misses the @lid/@c.us message', async () => {
    // Real WAHA/GOWS quirk: a contact has both a phone JID (@c.us) and a LID
    // (@lid); inbound and outbound messages serialize under different JIDs, so
    // getMessageById(chatId=…@c.us) can't resolve an id carrying …@lid — even
    // though the chat-history LIST returns that message with media.url. The repo
    // must fall back to a list scan and match by the stable trailing hash.
    const expectedBytes = Buffer.from([0xff, 0xd8, 0xff]);
    let scannedChatId: string | null = null;
    const deps = makeDeps({
      getMessageById: async () => null, // WAHA can't resolve it 1×1
      getChatMessages: async (_session, chatId) => {
        scannedChatId = chatId;
        return [
          makeWahaMessage({ id: 'false_37830675939455@lid_AAAA', hasMedia: false, media: null }),
          // same message the dashboard rendered — listed under @c.us serialization,
          // identical trailing hash 2ACF1BB83DA687CE0863.
          makeWahaMessage({
            id: 'true_5493472502738@c.us_2ACF1BB83DA687CE0863',
            hasMedia: true,
            media: { url: 'http://waha/api/s3/img', mimetype: 'image/png' },
          }),
        ];
      },
      downloadMedia: async () => ({ buffer: expectedBytes, mimetype: 'application/octet-stream' }),
    });

    const repo = createChatRepository(deps);
    // requested with the @lid serialization the dashboard captured from history
    const result = await repo.getMediaBytes(
      'session',
      '5493472502738@c.us',
      'true_37830675939455@lid_2ACF1BB83DA687CE0863',
    );

    assert.ok(result, 'media should resolve via the chat-history scan');
    assert.equal(result!.mimetype, 'image/png');
    assert.deepEqual(result!.bytes, expectedBytes);
    assert.equal(scannedChatId, '5493472502738@c.us');
  });

  it('returns null when neither the direct lookup nor the scan finds the message', async () => {
    const deps = makeDeps({
      getMessageById: async () => null,
      getChatMessages: async () => [
        makeWahaMessage({ id: 'false_other@c.us_UNRELATED', hasMedia: false }),
      ],
    });

    const repo = createChatRepository(deps);
    const result = await repo.getMediaBytes('session', 'chat@c.us', 'true_x@lid_NOTHERE');
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

// ── status publishing ──────────────────────────────────────────────────────────

describe('chat.repository — status publishing', () => {
  it('sendTextStatus passes sessionName and payload to WAHA dep', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      sendTextStatus: async (session, payload) => {
        captured = { session, payload };
      },
    });

    const repo = createChatRepository(deps);
    await repo.sendTextStatus('sess', { text: 'hola estado', backgroundColor: '#38b42f' });

    const args = captured as { session: string; payload: unknown };
    assert.equal(args.session, 'sess');
    assert.deepEqual(args.payload, { text: 'hola estado', backgroundColor: '#38b42f' });
  });

  it('sendImageStatus passes sessionName, file and caption to WAHA dep', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      sendImageStatus: async (session, payload) => {
        captured = { session, payload };
      },
    });

    const repo = createChatRepository(deps);
    const file = { data: 'base64data', mimetype: 'image/jpeg' };
    await repo.sendImageStatus('sess', { file, caption: 'mi caption' });

    const args = captured as { session: string; payload: { file: unknown; caption?: string } };
    assert.equal(args.session, 'sess');
    assert.deepEqual(args.payload.file, file);
    assert.equal(args.payload.caption, 'mi caption');
  });
});

// ── listChats pagination ────────────────────────────────────────────────────────

describe('chat.repository — listChats pagination', () => {
  it('forwards limit/offset opts to the WAHA dep', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      listChats: async (session, opts) => {
        captured = { session, opts };
        return [];
      },
    });

    const repo = createChatRepository(deps);
    await repo.listChats('sess', { limit: 20, offset: 40 });

    const args = captured as { session: string; opts: { limit?: number; offset?: number } };
    assert.equal(args.session, 'sess');
    assert.deepEqual(args.opts, { limit: 20, offset: 40 });
  });

  it('works without opts (back-compat)', async () => {
    const deps = makeDeps({ listChats: async () => [makeWahaChat({ id: 'c1@c.us' })] });
    const repo = createChatRepository(deps);
    const result = await repo.listChats('sess');
    assert.equal(result.length, 1);
  });
});
