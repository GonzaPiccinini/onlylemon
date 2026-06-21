import { EventEmitter } from 'node:events';

import type { ChatMessageEvent, ChatReactionEvent } from './chat.types.js';

const emitter = new EventEmitter();
// One listener is added per active SSE connection (per event name). Per-user
// connection caps live in realtime.routes.ts; this finite ceiling is a leak
// canary (emits a warning, never a hard failure) instead of the unlimited `0`,
// which silenced Node's listener-leak detection entirely. Raise it if you expect
// more than this many concurrent dashboard streams.
const MAX_SSE_LISTENERS = 1000;
emitter.setMaxListeners(MAX_SSE_LISTENERS);

const CHAT_MESSAGE_EVENT = 'chat-message';
const CHAT_REACTION_EVENT = 'chat-reaction';

export const publishChatMessage = (event: ChatMessageEvent): void => {
  emitter.emit(CHAT_MESSAGE_EVENT, event);
};

export const publishChatReaction = (event: ChatReactionEvent): void => {
  emitter.emit(CHAT_REACTION_EVENT, event);
};

export const subscribeChatMessage = (
  listener: (event: ChatMessageEvent) => void,
): (() => void) => {
  emitter.on(CHAT_MESSAGE_EVENT, listener);

  return () => {
    emitter.off(CHAT_MESSAGE_EVENT, listener);
  };
};

export const subscribeChatReaction = (
  listener: (event: ChatReactionEvent) => void,
): (() => void) => {
  emitter.on(CHAT_REACTION_EVENT, listener);

  return () => {
    emitter.off(CHAT_REACTION_EVENT, listener);
  };
};
