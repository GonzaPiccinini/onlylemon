import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  publishChatMessage,
  publishChatReaction,
  subscribeChatMessage,
  subscribeChatReaction,
} from './chat.events.js';

import type { ChatMessageEvent, ChatReactionEvent } from './chat.types.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeChatMessageEvent(
  overrides: Partial<ChatMessageEvent> = {},
): ChatMessageEvent {
  return {
    cashierId: 'cashier-1',
    sessionId: 'session-1',
    sessionName: 'my-session',
    chatId: 'chat-1@c.us',
    message: {
      id: 'msg-001',
      timestamp: 1_700_000_000,
      fromMe: false,
      body: 'Hello',
      hasMedia: false,
      mediaMimetype: null,
      reactions: [],
      quotedMessage: null,
    },
    ...overrides,
  };
}

function makeChatReactionEvent(
  overrides: Partial<ChatReactionEvent> = {},
): ChatReactionEvent {
  return {
    cashierId: 'cashier-1',
    sessionId: 'session-1',
    sessionName: 'my-session',
    chatId: 'chat-1@c.us',
    messageId: 'msg-001',
    emoji: '👍',
    fromMe: false,
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('chat.events — chat-message channel', () => {
  it('subscribeChatMessage receives a published ChatMessageEvent', (_, done) => {
    const event = makeChatMessageEvent();
    const unsub = subscribeChatMessage((received) => {
      unsub();
      assert.deepEqual(received, event);
      done();
    });
    publishChatMessage(event);
  });

  it('multiple subscribers all receive the same ChatMessageEvent', (_, done) => {
    const event = makeChatMessageEvent({ chatId: 'multi-sub-chat@c.us' });
    let count = 0;
    const target = 3;
    const unsubs: Array<() => void> = [];

    for (let i = 0; i < target; i++) {
      unsubs.push(
        subscribeChatMessage((received) => {
          assert.deepEqual(received, event);
          count++;
          if (count === target) {
            unsubs.forEach((u) => u());
            done();
          }
        }),
      );
    }

    publishChatMessage(event);
  });

  it('unsubscribe fn stops delivery of ChatMessageEvent', (_, done) => {
    const event = makeChatMessageEvent({ chatId: 'unsub-test@c.us' });
    let deliveries = 0;

    const unsub = subscribeChatMessage(() => {
      deliveries++;
    });

    // Unsubscribe BEFORE publishing
    unsub();
    publishChatMessage(event);

    // Give any synchronous delivery a chance to propagate (EventEmitter is sync)
    setImmediate(() => {
      assert.equal(deliveries, 0, 'listener should not have been called after unsub');
      done();
    });
  });

  it('no listener leak: subscribe then unsubscribe leaves listener count at baseline', () => {
    // We can't access the internal emitter directly, so we verify indirectly:
    // subscribe N times, unsubscribe all, publish → 0 deliveries
    const received: unknown[] = [];
    const unsubs: Array<() => void> = [];
    for (let i = 0; i < 5; i++) {
      unsubs.push(subscribeChatMessage((e) => received.push(e)));
    }
    unsubs.forEach((u) => u());
    publishChatMessage(makeChatMessageEvent());
    assert.equal(received.length, 0, 'no listeners should remain after all unsubs');
  });
});

describe('chat.events — chat-reaction channel', () => {
  it('subscribeChatReaction receives a published ChatReactionEvent', (_, done) => {
    const event = makeChatReactionEvent();
    const unsub = subscribeChatReaction((received) => {
      unsub();
      assert.deepEqual(received, event);
      done();
    });
    publishChatReaction(event);
  });

  it('multiple subscribers all receive the same ChatReactionEvent', (_, done) => {
    const event = makeChatReactionEvent({ emoji: '❤️' });
    let count = 0;
    const target = 2;
    const unsubs: Array<() => void> = [];

    for (let i = 0; i < target; i++) {
      unsubs.push(
        subscribeChatReaction((received) => {
          assert.deepEqual(received, event);
          count++;
          if (count === target) {
            unsubs.forEach((u) => u());
            done();
          }
        }),
      );
    }

    publishChatReaction(event);
  });

  it('unsubscribe fn stops delivery of ChatReactionEvent', (_, done) => {
    const event = makeChatReactionEvent({ emoji: '🔥' });
    let deliveries = 0;

    const unsub = subscribeChatReaction(() => {
      deliveries++;
    });

    unsub();
    publishChatReaction(event);

    setImmediate(() => {
      assert.equal(deliveries, 0, 'reaction listener should not fire after unsub');
      done();
    });
  });
});

describe('chat.events — channel isolation', () => {
  it('publishChatMessage does NOT deliver to reaction subscribers', (_, done) => {
    let reactionDeliveries = 0;
    const unsub = subscribeChatReaction(() => {
      reactionDeliveries++;
    });

    publishChatMessage(makeChatMessageEvent({ chatId: 'isolation-a@c.us' }));

    setImmediate(() => {
      unsub();
      assert.equal(reactionDeliveries, 0, 'reaction subscriber should not receive message events');
      done();
    });
  });

  it('publishChatReaction does NOT deliver to message subscribers', (_, done) => {
    let messageDeliveries = 0;
    const unsub = subscribeChatMessage(() => {
      messageDeliveries++;
    });

    publishChatReaction(makeChatReactionEvent({ chatId: 'isolation-b@c.us' }));

    setImmediate(() => {
      unsub();
      assert.equal(messageDeliveries, 0, 'message subscriber should not receive reaction events');
      done();
    });
  });
});
