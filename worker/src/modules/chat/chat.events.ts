import { EventEmitter } from 'node:events';

import type { ChatMessageEvent, ChatReactionEvent } from './chat.types.js';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

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
