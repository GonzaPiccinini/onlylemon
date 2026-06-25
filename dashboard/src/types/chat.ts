/**
 * chat.ts — Dashboard-side chat domain types.
 *
 * Mirrors `worker/src/modules/chat/chat.types.ts` exactly so the wire contract
 * stays in sync between the worker API and the dashboard consumer.
 *
 * Keep these pure type definitions — no runtime logic.
 */

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export type ChatReactionSummary = {
  emoji: string;
  fromMe: boolean;
};

export type QuotedMessage = {
  id: string;
  previewText: string | null;
  fromMe: boolean;
};

export type ChatMessage = {
  id: string;
  timestamp: number;
  fromMe: boolean;
  body: string;
  hasMedia: boolean;
  mediaMimetype: string | null;
  reactions: ChatReactionSummary[];
  quotedMessage: QuotedMessage | null;
  /**
   * Display name of the sender for GROUP chats (the label WhatsApp shows above
   * each incoming group message). null for 1:1 chats and for outbound messages.
   */
  senderName: string | null;
};

/**
 * Trimmed shape returned by GET .../chats.
 * Spec amendment: ChatListEntry is { chatId, displayName, lastMessageTimestamp }
 * (no lastMessagePreview — WAHA does not return a preview in V1).
 */
export type ChatListEntry = {
  chatId: string;
  displayName: string | null;
  lastMessageTimestamp: number;
};

// ---------------------------------------------------------------------------
// SSE event payload types
// ---------------------------------------------------------------------------
// These flow from the worker's in-process event bus → SSE stream → dashboard.

export type ChatMessageEvent = {
  cashierId: string;
  sessionId: string;    // WhatsappSession DB id
  sessionName: string;  // WAHA session name
  chatId: string;
  message: ChatMessage;
};

export type ChatReactionEvent = {
  cashierId: string;
  sessionId: string;
  sessionName: string;
  chatId: string;
  messageId: string;
  emoji: string;        // empty string = reaction removed
  fromMe: boolean;
};

// ---------------------------------------------------------------------------
// SSE envelope (raw EventSource message parsing)
// ---------------------------------------------------------------------------

/** Discriminated union of all event types the dashboard SSE stream can receive. */
export type ChatStreamEvent =
  | { type: "chat-message-received"; data: ChatMessageEvent }
  | { type: "chat-message-reaction"; data: ChatReactionEvent }
  | { type: "ping"; data: number };

// ---------------------------------------------------------------------------
// Request / response wrappers used by chat.service.ts
// ---------------------------------------------------------------------------

export type SendTextRequest = {
  text: string;
  replyTo?: string;
};

export type SendReactionRequest = {
  reaction: string;
};

/** Real-time typing presence state sent to the worker. */
export type TypingState = "start" | "stop";
