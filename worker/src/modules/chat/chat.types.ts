// Domain types for the chat module.
// These are pure TypeScript interfaces/types — no runtime logic.

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

// Adapted from Batch 0 findings: WAHA /api/{session}/chats only returns
// { id, name, conversationTimestamp }. No lastMessagePreview or unreadCount.
export type ChatListEntry = {
  chatId: string;
  displayName: string | null;
  lastMessageTimestamp: number;
};

// ── SSE event payload types ───────────────────────────────────────────────────
// These flow through the in-process event bus (chat.events.ts).
// sessionId resolution (sessionName → sessionId/cashierId) happens upstream
// in the bus publisher (Batch 11 wiring) — not here.

export type ChatMessageEvent = {
  cashierId: string;
  sessionId: string;    // WhatsappSession DB id
  sessionName: string;  // WAHA session name
  chatId: string;
  message: ChatMessage;
  /**
   * True when this inbound message's sender is ANOTHER connected line of the
   * SAME cashier (operator messaged between two of their own numbers). The
   * dashboard suppresses the self-notification + unread dot when set. Absent
   * for normal external messages and for outbound (fromMe) messages.
   */
  internalEcho?: boolean;
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
