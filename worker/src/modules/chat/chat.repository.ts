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

/**
 * How many recent messages getMediaBytes scans when a direct id lookup misses
 * (the @lid/@c.us addressing fallback). Covers a couple of history pages.
 */
const MEDIA_SCAN_LIMIT = 100;

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

  /**
   * Optional structured logger (pino-compatible). Injected so the repository
   * stays a pure deps layer — unit tests need no env/config to import it. The
   * default wiring passes the real worker logger; tests leave it undefined.
   */
  logger?: { warn(obj: Record<string, unknown>, msg: string): void };
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

/**
 * Stable WhatsApp message hash = the last `_`-delimited segment of a WAHA
 * message id (`{fromMe}_{chatJid}_{hash}`). It is identical across the @c.us
 * and @lid serializations of the SAME message, so it's the reliable key for
 * matching when a chat mixes a contact's phone JID and LID.
 */
function messageHash(id: string): string {
  const i = id.lastIndexOf('_');
  return i >= 0 ? id.slice(i + 1) : id;
}

/**
 * Turns a WAHA message into downloadable media bytes, or null when the message
 * carries no usable media (no media / no url) or the download fails.
 * mimetype is taken from MESSAGE METADATA, not the downloadMedia response header
 * (which returns application/octet-stream — the V1 octet-stream quirk).
 */
async function downloadMessageMedia(
  msg: WahaMessageShape,
  downloadMedia: ChatRepositoryDeps['downloadMedia'],
  logger?: ChatRepositoryDeps['logger'],
): Promise<{ bytes: Buffer; mimetype: string } | null> {
  if (!msg.hasMedia || !msg.media) return null;
  const mediaUrl = msg.media.url;
  if (!mediaUrl) {
    logger?.warn(
      { event: 'chat_media_url_missing', messageId: msg.id },
      'WAHA reports media but returned no url',
    );
    return null;
  }
  const mimetype = msg.media.mimetype ?? 'application/octet-stream';
  try {
    const { buffer } = await downloadMedia(mediaUrl);
    return { bytes: buffer, mimetype };
  } catch (err) {
    // R2 deletion gap / proxy failure / unreachable host — surface the REAL
    // reason (status, url) instead of collapsing every cause into a bare 404.
    logger?.warn(
      {
        event: 'chat_media_download_failed',
        messageId: msg.id,
        mediaUrl,
        err: err instanceof Error ? err.message : String(err),
      },
      'WAHA media download failed',
    );
    return null;
  }
}

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
    logger,
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
      // 1. Fast path — fetch the target message DIRECTLY by id (downloadMedia=true
      //    so WAHA populates media.url on demand, even for old messages).
      let direct: WahaMessageShape | null = null;
      try {
        direct = await getMessageById(sessionName, chatId, messageId, { downloadMedia: true });
      } catch {
        direct = null; // transient WAHA failure — fall through to the scan
      }
      if (direct) {
        const bytes = await downloadMessageMedia(direct, downloadMedia, logger);
        if (bytes) return bytes;
      }

      // 2. Fallback — WAHA can't always resolve a message 1×1 when a chat mixes a
      //    contact's phone JID (@c.us) and LID (@lid): inbound and outbound
      //    messages serialize under different JIDs, so getMessageById(chatId=…@c.us)
      //    misses an id carrying …@lid (and vice-versa) and returns null. The
      //    chat-history LIST does return these messages (merged) with media.url, so
      //    scan it and match by the stable trailing hash, which is identical across
      //    addressing modes. (The real wiring passes downloadMedia=true on the list.)
      const wantedHash = messageHash(messageId);
      let scanned: WahaMessageShape[] = [];
      try {
        scanned = await getChatMessages(sessionName, chatId, { limit: MEDIA_SCAN_LIMIT });
      } catch {
        scanned = [];
      }
      const match = scanned.find(
        (m) => m.id === messageId || messageHash(m.id) === wantedHash,
      );
      if (match) {
        const bytes = await downloadMessageMedia(match, downloadMedia, logger);
        if (bytes) return bytes;
      }

      logger?.warn(
        { event: 'chat_media_unresolved', sessionName, chatId, messageId, scannedCount: scanned.length },
        'chat media could not be resolved via getMessageById or chat-history scan',
      );
      return null;
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
  const { logger } = await import('../../lib/logger.js');

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
    logger,
  });
}
