/**
 * chat.service.test.ts
 *
 * Tests for the chat service — ownership-gated business logic.
 * Written FIRST (RED) before implementation exists.
 *
 * Dependencies are all injected mocks.
 * Rate limiter uses an injectable clock (nowFn) for deterministic testing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createChatService } from './chat.service.js';
import type { ChatServiceDeps } from './chat.service.js';
import { ChatForbiddenError, ChatRateLimitError, ChatSessionNotFoundError } from './chat.service.js';
import type { ChatListEntry, ChatMessage } from './chat.types.js';

// ── builders ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-uuid-1',
    sessionName: 'cashier-abc-xyz',
    cashierId: 'cashier-1',
    ...overrides,
  };
}

function makeChatListEntry(overrides: Partial<ChatListEntry> = {}): ChatListEntry {
  return {
    chatId: '5491112345678@c.us',
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

// ── default mock deps ──────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ChatServiceDeps> = {}): ChatServiceDeps {
  return {
    getWhatsappSession: async () => makeSession(),
    setSessionAlias: async () => {},
    repository: {
      listChats: async () => [makeChatListEntry()],
      getChatHistory: async () => [makeChatMessage()],
      sendText: async () => {},
      sendImage: async () => {},
      sendReaction: async () => {},
      getMediaBytes: async () => ({ bytes: Buffer.from('fake'), mimetype: 'image/jpeg' }),
      sendTextStatus: async () => {},
      sendImageStatus: async () => {},
      startTyping: async () => {},
      stopTyping: async () => {},
      sendSeen: async () => {},
    },
    nowFn: () => 0,
    ...overrides,
  };
}

// ── ownership enforcement ──────────────────────────────────────────────────────

describe('chat.service — CASHIER ownership gate', () => {
  it('CASHIER listing own session succeeds', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    const result = await service.listChats({
      sessionId: 'session-uuid-1',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.ok(Array.isArray(result));
  });

  it('CASHIER listing a session owned by another cashier throws ChatForbiddenError', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    }));

    await assert.rejects(
      () => service.listChats({
        sessionId: 'session-uuid-1',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => {
        assert.ok(err instanceof ChatForbiddenError);
        return true;
      },
    );
  });

  it('ADMIN listing any session succeeds regardless of session owner', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    }));

    const result = await service.listChats({
      sessionId: 'session-uuid-1',
      requesterCashierId: 'cashier-1',
      requesterRole: 'ADMIN',
    });

    assert.ok(Array.isArray(result));
  });

  it('SUPER_ADMIN listing any session succeeds', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    }));

    const result = await service.listChats({
      sessionId: 'session-uuid-1',
      requesterCashierId: undefined,
      requesterRole: 'SUPER_ADMIN',
    });

    assert.ok(Array.isArray(result));
  });

  it('throws ChatSessionNotFoundError when session is not found', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => null,
    }));

    await assert.rejects(
      () => service.listChats({
        sessionId: 'missing-session',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => {
        assert.ok(err instanceof ChatSessionNotFoundError);
        return true;
      },
    );
  });
});

// ── getChatHistory ownership gate ──────────────────────────────────────────────

describe('chat.service — getChatHistory ownership gate', () => {
  it('CASHIER accessing foreign session chat history throws ChatForbiddenError', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'owner-cashier' }),
    }));

    await assert.rejects(
      () => service.getChatHistory({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        limit: 20,
        requesterCashierId: 'other-cashier',
        requesterRole: 'CASHIER',
      }),
      (err) => {
        assert.ok(err instanceof ChatForbiddenError);
        return true;
      },
    );
  });

  it('ADMIN can access any chat history', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'owner-cashier' }),
    }));

    const result = await service.getChatHistory({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      limit: 20,
      requesterCashierId: 'admin-user',
      requesterRole: 'ADMIN',
    });

    assert.ok(Array.isArray(result));
  });
});

// ── rate limiting ─────────────────────────────────────────────────────────────

describe('chat.service — rate limiting for sendText', () => {
  it('sendText succeeds when rate bucket has tokens', async () => {
    let now = 0;
    const service = createChatService(makeDeps({ nowFn: () => now }));

    await assert.doesNotReject(() =>
      service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: 'hello',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
    );
  });

  it('sendText throws ChatRateLimitError when bucket is exhausted', async () => {
    let now = 0;
    const service = createChatService(makeDeps({
      nowFn: () => now,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    // exhaust all 10 tokens
    for (let i = 0; i < 10; i++) {
      await service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: `msg ${i}`,
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      });
    }

    // 11th should throw
    await assert.rejects(
      () => service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: 'rate limited',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => {
        assert.ok(err instanceof ChatRateLimitError);
        return true;
      },
    );
  });

  it('sendText and sendPhoto share the same rate bucket', async () => {
    let now = 0;
    const service = createChatService(makeDeps({
      nowFn: () => now,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    // use 9 text tokens
    for (let i = 0; i < 9; i++) {
      await service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: `msg ${i}`,
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      });
    }

    // 1 photo consumes the 10th token
    await service.sendPhoto({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      file: { data: Buffer.from('fake'), mimetype: 'image/jpeg' },
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    // next text is blocked
    await assert.rejects(
      () => service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: 'over limit',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => {
        assert.ok(err instanceof ChatRateLimitError);
        return true;
      },
    );
  });
});

// ── sendReaction — separate, lenient rate bucket ───────────────────────────────

describe('chat.service — sendReaction uses a separate rate bucket', () => {
  it('throws ChatRateLimitError once the dedicated reaction bucket is exhausted', async () => {
    let now = 0;
    const service = createChatService(makeDeps({
      nowFn: () => now,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    // The reaction bucket capacity is 20 — drain it.
    for (let i = 0; i < 20; i++) {
      await service.sendReaction({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        messageId: 'msg-001',
        reaction: '👍',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      });
    }

    // 21st reaction is blocked.
    await assert.rejects(
      () => service.sendReaction({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        messageId: 'msg-001',
        reaction: '👍',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => {
        assert.ok(err instanceof ChatRateLimitError);
        return true;
      },
    );
  });

  it('reaction bucket is independent from the text/photo bucket', async () => {
    let now = 0;
    const service = createChatService(makeDeps({
      nowFn: () => now,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    // Drain the entire reaction bucket.
    for (let i = 0; i < 20; i++) {
      await service.sendReaction({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        messageId: 'msg-001',
        reaction: '👍',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      });
    }

    // Text still works — it has its own untouched bucket.
    await assert.doesNotReject(() =>
      service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: 'still works',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
    );
  });

  it('sendReaction succeeds even after text bucket is fully exhausted', async () => {
    let now = 0;
    const service = createChatService(makeDeps({
      nowFn: () => now,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    // drain all tokens
    for (let i = 0; i < 10; i++) {
      await service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: `msg ${i}`,
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      });
    }

    // reaction should still work
    await assert.doesNotReject(() =>
      service.sendReaction({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        messageId: 'msg-001',
        reaction: '👍',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
    );
  });

  it('sendReaction does NOT consume from the rate bucket', async () => {
    let now = 0;
    const service = createChatService(makeDeps({
      nowFn: () => now,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    // use 9 tokens via text
    for (let i = 0; i < 9; i++) {
      await service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: `msg ${i}`,
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      });
    }

    // reaction (doesn't consume)
    await service.sendReaction({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      messageId: 'msg-001',
      reaction: '👍',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    // 10th text should STILL SUCCEED (reaction didn't eat a token)
    await assert.doesNotReject(() =>
      service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: 'still in budget',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
    );
  });
});

// ── getMediaBytes ─────────────────────────────────────────────────────────────

describe('chat.service — getMediaBytes', () => {
  it('returns bytes and mimetype when repository succeeds', async () => {
    const fakeBytes = Buffer.from([1, 2, 3]);
    const service = createChatService(makeDeps({
      repository: {
        listChats: async () => [],
        getChatHistory: async () => [],
        sendText: async () => {},
        sendImage: async () => {},
        sendReaction: async () => {},
        getMediaBytes: async () => ({ bytes: fakeBytes, mimetype: 'image/png' }),
        sendTextStatus: async () => {},
        sendImageStatus: async () => {},
        startTyping: async () => {},
        stopTyping: async () => {},
        sendSeen: async () => {},
      },
    }));

    const result = await service.getMediaBytes({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      messageId: 'msg-001',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.ok(result);
    assert.deepEqual(result!.bytes, fakeBytes);
    assert.equal(result!.mimetype, 'image/png');
  });

  it('returns null when repository returns null (media unavailable)', async () => {
    const service = createChatService(makeDeps({
      repository: {
        listChats: async () => [],
        getChatHistory: async () => [],
        sendText: async () => {},
        sendImage: async () => {},
        sendReaction: async () => {},
        getMediaBytes: async () => null,
        sendTextStatus: async () => {},
        sendImageStatus: async () => {},
        startTyping: async () => {},
        stopTyping: async () => {},
        sendSeen: async () => {},
      },
    }));

    const result = await service.getMediaBytes({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      messageId: 'msg-gone',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.equal(result, null);
  });

  it('CASHIER getMediaBytes in foreign session throws ChatForbiddenError', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'other-cashier' }),
    }));

    await assert.rejects(
      () => service.getMediaBytes({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        messageId: 'msg-001',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => {
        assert.ok(err instanceof ChatForbiddenError);
        return true;
      },
    );
  });
});

// ── sendText with replyTo ─────────────────────────────────────────────────────

describe('chat.service — sendText forwards replyTo', () => {
  it('forwards replyTo to repository.sendText when provided', async () => {
    let capturedReplyTo: string | undefined;
    const service = createChatService(makeDeps({
      repository: {
        listChats: async () => [],
        getChatHistory: async () => [],
        sendText: async (_session, _chatId, _text, replyTo) => {
          capturedReplyTo = replyTo;
        },
        sendImage: async () => {},
        sendReaction: async () => {},
        getMediaBytes: async () => null,
        sendTextStatus: async () => {},
        sendImageStatus: async () => {},
        startTyping: async () => {},
        stopTyping: async () => {},
        sendSeen: async () => {},
      },
    }));

    await service.sendText({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      text: 'hello',
      replyTo: 'quoted-msg-id',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.equal(capturedReplyTo, 'quoted-msg-id');
  });
});

// ── status publishing ──────────────────────────────────────────────────────────

describe('chat.service — status publishing', () => {
  it('publishTextStatus delegates to repository with resolved sessionName', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ sessionName: 'waha-sess', cashierId: 'cashier-1' }),
    });
    deps.repository.sendTextStatus = async (sessionName, payload) => {
      captured = { sessionName, payload };
    };

    const service = createChatService(deps);
    await service.publishTextStatus({
      sessionId: 'session-uuid-1',
      text: 'hola estado',
      backgroundColor: '#38b42f',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    const args = captured as { sessionName: string; payload: { text: string; backgroundColor?: string } };
    assert.equal(args.sessionName, 'waha-sess');
    assert.equal(args.payload.text, 'hola estado');
    assert.equal(args.payload.backgroundColor, '#38b42f');
  });

  it('publishTextStatus throws ChatForbiddenError for foreign cashier', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    }));

    await assert.rejects(
      () => service.publishTextStatus({
        sessionId: 'session-uuid-1',
        text: 'x',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => err instanceof ChatForbiddenError,
    );
  });

  it('publishImageStatus base64-encodes Buffer file data and delegates', async () => {
    let captured: unknown = null;
    const deps = makeDeps();
    deps.repository.sendImageStatus = async (sessionName, payload) => {
      captured = { sessionName, payload };
    };

    const service = createChatService(deps);
    await service.publishImageStatus({
      sessionId: 'session-uuid-1',
      file: { data: Buffer.from('rawbytes'), mimetype: 'image/png' },
      caption: 'cap',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    const args = captured as {
      sessionName: string;
      payload: { file: { data: string; mimetype: string }; caption?: string };
    };
    assert.equal(args.payload.file.data, Buffer.from('rawbytes').toString('base64'));
    assert.equal(args.payload.file.mimetype, 'image/png');
    assert.equal(args.payload.caption, 'cap');
  });

  it('publishTextStatus consumes the shared rate bucket and throws ChatRateLimitError when exhausted', async () => {
    const deps = makeDeps({ nowFn: () => 0 });
    deps.repository.sendTextStatus = async () => {};

    const service = createChatService(deps);
    const args = {
      sessionId: 'session-uuid-1',
      text: 'x',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER' as const,
    };

    // capacity = 10 — the 11th call must throw
    for (let i = 0; i < 10; i++) {
      await service.publishTextStatus(args);
    }
    await assert.rejects(
      () => service.publishTextStatus(args),
      (err) => err instanceof ChatRateLimitError,
    );
  });
});

// ── listChats pagination ────────────────────────────────────────────────────────

describe('chat.service — listChats pagination', () => {
  it('forwards limit/offset to the repository with the resolved sessionName', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ sessionName: 'waha-sess', cashierId: 'cashier-1' }),
    });
    deps.repository.listChats = async (sessionName, opts) => {
      captured = { sessionName, opts };
      return [];
    };

    const service = createChatService(deps);
    await service.listChats({
      sessionId: 'session-uuid-1',
      limit: 20,
      offset: 20,
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    const args = captured as { sessionName: string; opts: { limit?: number; offset?: number } };
    assert.equal(args.sessionName, 'waha-sess');
    assert.equal(args.opts.limit, 20);
    assert.equal(args.opts.offset, 20);
  });
});

// ── setSessionAlias ─────────────────────────────────────────────────────────────

describe('chat.service — setSessionAlias', () => {
  it('persists the trimmed alias for the owner', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    });
    deps.setSessionAlias = async (sessionId, alias) => { captured = { sessionId, alias }; };

    const service = createChatService(deps);
    await service.setSessionAlias({
      sessionId: 'session-uuid-1',
      alias: '  Ventas Córdoba  ',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.deepEqual(captured, { sessionId: 'session-uuid-1', alias: 'Ventas Córdoba' });
  });

  it('clears the alias (null) when given empty/whitespace', async () => {
    let captured: unknown = 'UNSET';
    const deps = makeDeps();
    deps.setSessionAlias = async (_sessionId, alias) => { captured = alias; };

    const service = createChatService(deps);
    await service.setSessionAlias({
      sessionId: 'session-uuid-1',
      alias: '   ',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.equal(captured, null);
  });

  it('throws ChatForbiddenError for a foreign cashier', async () => {
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    });
    deps.setSessionAlias = async () => {};

    const service = createChatService(deps);
    await assert.rejects(
      () => service.setSessionAlias({
        sessionId: 'session-uuid-1',
        alias: 'x',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => err instanceof ChatForbiddenError,
    );
  });

  it('allows ADMIN to set alias on any session', async () => {
    let called = false;
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    });
    deps.setSessionAlias = async () => { called = true; };

    const service = createChatService(deps);
    await service.setSessionAlias({
      sessionId: 'session-uuid-1',
      alias: 'Admin name',
      requesterRole: 'ADMIN',
    });
    assert.equal(called, true);
  });
});

// ── setTyping (real-time typing presence) ──────────────────────────────────────

describe('chat.service — setTyping', () => {
  it('start delegates to repository.startTyping with the resolved sessionName + chatId', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ sessionName: 'waha-sess', cashierId: 'cashier-1' }),
    });
    deps.repository.startTyping = async (sessionName, chatId) => {
      captured = { sessionName, chatId };
    };

    const service = createChatService(deps);
    await service.setTyping({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      state: 'start',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.deepEqual(captured, { sessionName: 'waha-sess', chatId: 'chat@c.us' });
  });

  it('stop delegates to repository.stopTyping with the resolved sessionName + chatId', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ sessionName: 'waha-sess', cashierId: 'cashier-1' }),
    });
    deps.repository.stopTyping = async (sessionName, chatId) => {
      captured = { sessionName, chatId };
    };

    const service = createChatService(deps);
    await service.setTyping({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      state: 'stop',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.deepEqual(captured, { sessionName: 'waha-sess', chatId: 'chat@c.us' });
  });

  it('CASHIER setTyping on a foreign session throws ChatForbiddenError', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    }));

    await assert.rejects(
      () => service.setTyping({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        state: 'start',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => err instanceof ChatForbiddenError,
    );
  });

  it('throws ChatSessionNotFoundError when the session does not exist', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => null,
    }));

    await assert.rejects(
      () => service.setTyping({
        sessionId: 'missing',
        chatId: 'chat@c.us',
        state: 'start',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => err instanceof ChatSessionNotFoundError,
    );
  });

  it('swallows repository/WAHA errors (presence is best-effort)', async () => {
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    });
    deps.repository.startTyping = async () => {
      throw new Error('WAHA startTyping failed with status 500');
    };

    const service = createChatService(deps);
    await assert.doesNotReject(() =>
      service.setTyping({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        state: 'start',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
    );
  });

  it('does NOT consume the send rate bucket (independent)', async () => {
    let now = 0;
    const service = createChatService(makeDeps({
      nowFn: () => now,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    }));

    // Many typing pings...
    for (let i = 0; i < 15; i++) {
      await service.setTyping({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        state: i % 2 === 0 ? 'start' : 'stop',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      });
    }

    // ...must not eat into the text/photo budget.
    await assert.doesNotReject(() =>
      service.sendText({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        text: 'still in budget',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
    );
  });

  it('drops silently when its own bucket is exhausted (no throw, not forwarded)', async () => {
    let calls = 0;
    const deps = makeDeps({
      nowFn: () => 0,
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    });
    deps.repository.startTyping = async () => { calls += 1; };

    const service = createChatService(deps);
    const args = {
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      state: 'start' as const,
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER' as const,
    };

    // Drain the typing bucket (capacity 20) — none should throw.
    for (let i = 0; i < 20; i++) {
      await service.setTyping(args);
    }
    // The 21st is over budget: it must NOT throw and must NOT reach the repository.
    await assert.doesNotReject(() => service.setTyping(args));
    assert.equal(calls, 20);
  });
});

// ── markSeen (mark a chat's messages as read) ──────────────────────────────────

describe('chat.service — markSeen', () => {
  it('delegates to repository.sendSeen with the resolved sessionName + chatId', async () => {
    let captured: unknown = null;
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ sessionName: 'waha-sess', cashierId: 'cashier-1' }),
    });
    deps.repository.sendSeen = async (sessionName, chatId) => {
      captured = { sessionName, chatId };
    };

    const service = createChatService(deps);
    await service.markSeen({
      sessionId: 'session-uuid-1',
      chatId: 'chat@c.us',
      requesterCashierId: 'cashier-1',
      requesterRole: 'CASHIER',
    });

    assert.deepEqual(captured, { sessionName: 'waha-sess', chatId: 'chat@c.us' });
  });

  it('CASHIER markSeen on a foreign session throws ChatForbiddenError', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-OTHER' }),
    }));

    await assert.rejects(
      () => service.markSeen({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => err instanceof ChatForbiddenError,
    );
  });

  it('throws ChatSessionNotFoundError when the session does not exist', async () => {
    const service = createChatService(makeDeps({
      getWhatsappSession: async () => null,
    }));

    await assert.rejects(
      () => service.markSeen({
        sessionId: 'missing',
        chatId: 'chat@c.us',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
      (err) => err instanceof ChatSessionNotFoundError,
    );
  });

  it('swallows repository/WAHA errors (best-effort)', async () => {
    const deps = makeDeps({
      getWhatsappSession: async () => makeSession({ cashierId: 'cashier-1' }),
    });
    deps.repository.sendSeen = async () => {
      throw new Error('WAHA sendSeen failed with status 500');
    };

    const service = createChatService(deps);
    await assert.doesNotReject(() =>
      service.markSeen({
        sessionId: 'session-uuid-1',
        chatId: 'chat@c.us',
        requesterCashierId: 'cashier-1',
        requesterRole: 'CASHIER',
      }),
    );
  });
});
