/**
 * chat.repository.ts
 *
 * Thin WAHA-delegating layer — the V2-mirror seam.
 *
 * In V1 this layer purely delegates to the WAHA client and maps WAHA shapes
 * to domain types (ChatListEntry, ChatMessage). In V2, this would be replaced
 * by a Postgres mirror with the same interface — nothing above the repository
 * changes.
 *
 * All WAHA client functions are injected as deps so the repository is
 * fully testable without real network calls.
 */

import type { ChatListEntry, ChatMessage, ChatReactionSummary, QuotedMessage } from './chat.types.js';
import { extractGroupSenderName } from './group-sender.js';

// ── Injected deps (WAHA client function signatures) ────────────────────────────

export type ChatListOptions = { limit?: number; offset?: number };

export type ChatRepositoryDeps = {
  /** Calls WAHA GET /api/{session}/chats */
  listChats(session: string, opts?: ChatListOptions): Promise<Array<{
    id: string;
    name?: string | null;
    conversationTimestamp?: number | null;
    [key: string]: unknown;
  }>>;

  /** Calls WAHA GET /api/{session}/chats/{chatId}/messages */
  getChatMessages(
    session: string,
    chatId: string,
    opts: { limit: number; offset?: number },
  ): Promise<Array<WahaMessageShape>>;

  /**
   * Calls WAHA GET /api/{session}/chats/{chatId}/messages/{messageId}.
   * Fetches a SINGLE message directly by id (returns null when WAHA 404s).
   * Used by getMediaBytes so media resolves regardless of how old the message
   * is — the previous recent-window list scan missed anything beyond its limit.
   */
  getMessageById(
    session: string,
    chatId: string,
    messageId: string,
    opts?: { downloadMedia?: boolean },
  ): Promise<WahaMessageShape | null>;

  /** Downloads media bytes from a WAHA-served URL */
  downloadMedia(url: string): Promise<{ buffer: Buffer; mimetype: string }>;

  /** Calls WAHA POST /api/sendText */
  sendText(session: string, chatId: string, text: string, replyTo?: string): Promise<void>;

  /** Calls WAHA POST /api/sendImage */
  sendImage(
    session: string,
    chatId: string,
    file: { data: string; mimetype: string },
    caption?: string,
  ): Promise<void>;

  /** Calls WAHA PUT /api/reaction */
  sendReaction(session: string, messageId: string, reaction: string): Promise<void>;

  /** Calls WAHA POST /api/{session}/status/text */
  sendTextStatus(session: string, payload: TextStatusPayload): Promise<void>;

  /** Calls WAHA POST /api/{session}/status/image */
  sendImageStatus(session: string, payload: ImageStatusPayload): Promise<void>;
};

// ── Status payloads ────────────────────────────────────────────────────────────

export type TextStatusPayload = {
  text: string;
  backgroundColor?: string;
  font?: number;
};

export type ImageStatusPayload = {
  file: { data: string; mimetype: string };
  caption?: string;
};

// ── Internal WAHA shape (permissive — tolerates extra fields via index sig) ───

export type WahaMessageShape = {
  id: string;
  timestamp?: number;
  from?: string;
  fromMe?: boolean;
  body?: string | null;
  hasMedia?: boolean;
  media?: {
    url?: string | null;
    mimetype?: string;
    [key: string]: unknown;
  } | null;
  /** Real GOWS reaction shape: { text: string, fromMe?: boolean } */
  reactions?: Array<{
    text?: string;
    emoji?: string;   // some WAHA versions use emoji instead of text
    fromMe?: boolean;
    [key: string]: unknown;
  }>;
  /** Quoted message reference (WAHA calls it replyTo on inbound) */
  replyTo?: {
    id?: string;
    body?: string | null;
    fromMe?: boolean;
    participant?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

// ── Mapping helpers ────────────────────────────────────────────────────────────

function mapWahaReactions(raw: WahaMessageShape['reactions']): ChatReactionSummary[] {
  if (!raw || raw.length === 0) return [];

  return raw.map((r) => ({
    // WAHA GOWS 2026.3.4 uses `text` field for the emoji (not `emoji`)
    emoji: r.text ?? r.emoji ?? '',
    fromMe: r.fromMe ?? false,
  }));
}

function mapWahaReplyTo(raw: WahaMessageShape['replyTo']): QuotedMessage | null {
  if (!raw) return null;
  if (!raw.id && !raw.body) return null;

  return {
    id: raw.id ?? '',
    previewText: raw.body ?? null,
    fromMe: raw.fromMe ?? false,
  };
}

function mapWahaMessageToChatMessage(msg: WahaMessageShape): ChatMessage {
  return {
    id: msg.id,
    timestamp: msg.timestamp ?? 0,
    fromMe: msg.fromMe ?? false,
    body: msg.body ?? '',
    hasMedia: msg.hasMedia ?? false,
    mediaMimetype: msg.hasMedia && msg.media?.mimetype ? msg.media.mimetype : null,
    reactions: mapWahaReactions(msg.reactions),
    quotedMessage: mapWahaReplyTo(msg.replyTo),
    senderName: extractGroupSenderName(msg),
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export type ChatRepository = {
  listChats(sessionName: string, opts?: ChatListOptions): Promise<ChatListEntry[]>;
  getChatHistory(
    sessionName: string,
    chatId: string,
    opts: { limit: number; offset?: number },
  ): Promise<ChatMessage[]>;
  getMediaBytes(
    sessionName: string,
    chatId: string,
    messageId: string,
  ): Promise<{ bytes: Buffer; mimetype: string } | null>;
  sendText(sessionName: string, chatId: string, text: string, replyTo?: string): Promise<void>;
  sendImage(
    sessionName: string,
    chatId: string,
    file: { data: string; mimetype: string },
    caption?: string,
  ): Promise<void>;
  sendReaction(sessionName: string, messageId: string, reaction: string): Promise<void>;
  sendTextStatus(sessionName: string, payload: TextStatusPayload): Promise<void>;
  sendImageStatus(sessionName: string, payload: ImageStatusPayload): Promise<void>;
};

export function createChatRepository(deps: ChatRepositoryDeps): ChatRepository {
  const {
    listChats,
    getChatMessages,
    getMessageById,
    downloadMedia,
    sendText,
    sendImage,
    sendReaction,
    sendTextStatus,
    sendImageStatus,
  } = deps;

  return {
    async listChats(sessionName: string, opts?: ChatListOptions): Promise<ChatListEntry[]> {
      const raw = await listChats(sessionName, opts);

      const entries: ChatListEntry[] = raw.map((entry) => ({
        chatId: entry.id,
        displayName: entry.name ?? null,
        lastMessageTimestamp: entry.conversationTimestamp ?? 0,
      }));

      // Sort descending by lastMessageTimestamp (most recently active first).
      // WAHA already sorts desc, but we re-sort defensively within the page so
      // ordering is stable regardless of engine behaviour.
      entries.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);

      return entries;
    },

    async getChatHistory(
      sessionName: string,
      chatId: string,
      opts: { limit: number; offset?: number },
    ): Promise<ChatMessage[]> {
      const messages = await getChatMessages(sessionName, chatId, opts);
      return messages.map(mapWahaMessageToChatMessage);
    },

    async getMediaBytes(
      sessionName: string,
      chatId: string,
      messageId: string,
    ): Promise<{ bytes: Buffer; mimetype: string } | null> {
      // Fetch the target message DIRECTLY by id (with downloadMedia=true so WAHA
      // populates media.url on demand). The previous implementation scanned the
      // 50 most-recent messages and `find`-ed the target — which silently 404'd
      // media on anything older than that window, even when WAHA had the URL.
      let msg: WahaMessageShape | null;
      try {
        msg = await getMessageById(sessionName, chatId, messageId, { downloadMedia: true });
      } catch {
        return null;
      }

      if (!msg) return null;
      if (!msg.hasMedia) return null;
      if (!msg.media) return null;

      const mediaUrl = msg.media.url;
      if (!mediaUrl) return null;

      // Capture mimetype from MESSAGE METADATA — not from the WAHA download response
      // header (which returns application/octet-stream). This is the V1 octet-stream
      // quirk documented in auto-conversion/service.ts.
      const mimetypeFromMetadata = msg.media.mimetype ?? 'application/octet-stream';

      try {
        const { buffer } = await downloadMedia(mediaUrl as string);
        return { bytes: buffer, mimetype: mimetypeFromMetadata };
      } catch {
        // R2 deletion gap — media is gone; controller will return 404 MEDIA_UNAVAILABLE
        return null;
      }
    },

    async sendText(
      sessionName: string,
      chatId: string,
      text: string,
      replyTo?: string,
    ): Promise<void> {
      return sendText(sessionName, chatId, text, replyTo);
    },

    async sendImage(
      sessionName: string,
      chatId: string,
      file: { data: string; mimetype: string },
      caption?: string,
    ): Promise<void> {
      return sendImage(sessionName, chatId, file, caption);
    },

    async sendReaction(
      sessionName: string,
      messageId: string,
      reaction: string,
    ): Promise<void> {
      return sendReaction(sessionName, messageId, reaction);
    },

    async sendTextStatus(sessionName: string, payload: TextStatusPayload): Promise<void> {
      return sendTextStatus(sessionName, payload);
    },

    async sendImageStatus(sessionName: string, payload: ImageStatusPayload): Promise<void> {
      return sendImageStatus(sessionName, payload);
    },
  };
}

// ── Default wiring (uses real WAHA client functions) ─────────────────────────

/**
 * Creates a ChatRepository wired to the real WAHA client.
 * Import lazily to avoid circular deps — call from the controller/service,
 * not at module load time.
 */
export async function createDefaultChatRepository(): Promise<ChatRepository> {
  const {
    listChats,
    getChatMessages,
    getMessageById,
    downloadMedia,
    sendText,
    sendImage,
    sendReaction,
    sendTextStatus,
    sendImageStatus,
  } = await import('../../integrations/waha/client.js');

  return createChatRepository({
    listChats: (session, opts) => listChats(session, opts),
    getChatMessages: (session, chatId, opts) =>
      getChatMessages(session, chatId, { limit: opts.limit, offset: opts.offset, sortBy: 'timestamp', sortOrder: 'desc', downloadMedia: true }),
    getMessageById: (session, chatId, messageId, opts) =>
      getMessageById(session, chatId, messageId, { downloadMedia: opts?.downloadMedia ?? true }),
    downloadMedia: (url) => downloadMedia(url),
    sendText: (session, chatId, text, replyTo) => sendText(session, chatId, text, replyTo),
    sendImage: (session, chatId, file, caption) => sendImage(session, chatId, file, caption),
    sendReaction: (session, messageId, reaction) => sendReaction(session, messageId, reaction),
    sendTextStatus: (session, payload) => sendTextStatus(session, payload),
    sendImageStatus: (session, payload) => sendImageStatus(session, payload),
  });
}
