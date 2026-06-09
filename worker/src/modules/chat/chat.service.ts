/**
 * chat.service.ts
 *
 * Business logic layer for the chat module.
 *
 * Responsibilities:
 * 1. Resolve sessionId → WhatsappSession (id, sessionName, cashierId).
 * 2. Enforce ownership for CASHIER role — throw ChatForbiddenError when
 *    the requesting cashier does not own the session.
 * 3. Enforce per-session rate limiting for sendText + sendPhoto (shared bucket).
 *    Reactions bypass the rate limiter entirely.
 * 4. Delegate to ChatRepository for all WAHA I/O.
 *
 * All collaborators are injected as deps so the service is unit-testable
 * without real DB or WAHA calls.
 */

import { createRateLimiter } from './rate-limiter.js';
import type { RateLimiter } from './rate-limiter.js';
import type { ChatRepository } from './chat.repository.js';
import type { ChatListEntry, ChatMessage } from './chat.types.js';

// ── Typed errors ───────────────────────────────────────────────────────────────

/** Caller does not own the requested session (HTTP 403). */
export class ChatForbiddenError extends Error {
  constructor(message = 'Access to this session is forbidden') {
    super(message);
    this.name = 'ChatForbiddenError';
  }
}

/** Rate bucket exhausted — caller should retry later (HTTP 429). */
export class ChatRateLimitError extends Error {
  constructor(message = 'Rate limit exceeded — too many messages sent') {
    super(message);
    this.name = 'ChatRateLimitError';
  }
}

/** The requested WhatsappSession does not exist (HTTP 404). */
export class ChatSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`WhatsappSession not found: ${sessionId}`);
    this.name = 'ChatSessionNotFoundError';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = 'CASHIER' | 'ADMIN' | 'SUPER_ADMIN';

type WhatsappSessionRow = {
  id: string;
  sessionName: string;
  cashierId: string;
};

export type ChatServiceDeps = {
  /** Resolves a DB sessionId → WhatsappSession row, or null if not found */
  getWhatsappSession(sessionId: string): Promise<WhatsappSessionRow | null>;

  /** The WAHA-backed repository */
  repository: ChatRepository;

  /**
   * Injectable clock (ms). Default: Date.now.
   * Used by the per-session rate limiter for deterministic testing.
   */
  nowFn?: () => number;
};

// ── Rate-limiter options (Design §6) ──────────────────────────────────────────
// capacity:          10 tokens  (burst)
// refillIntervalMs:  500ms      (≈ 2 tokens/sec sustained → 10 msg / 5s steady-state)
const RATE_CAPACITY = 10;
const RATE_REFILL_INTERVAL_MS = 500;

// ── Owner check ────────────────────────────────────────────────────────────────

function isOwner(session: WhatsappSessionRow, role: Role, requesterCashierId?: string): boolean {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
  return session.cashierId === requesterCashierId;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export type ChatService = {
  listChats(args: {
    sessionId: string;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<ChatListEntry[]>;

  getChatHistory(args: {
    sessionId: string;
    chatId: string;
    limit: number;
    offset?: number;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<ChatMessage[]>;

  sendText(args: {
    sessionId: string;
    chatId: string;
    text: string;
    replyTo?: string;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<void>;

  sendPhoto(args: {
    sessionId: string;
    chatId: string;
    /** file.data may be a Buffer (controller base64-encodes it before calling sendImage) */
    file: { data: Buffer | string; mimetype: string };
    caption?: string;
    replyTo?: string;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<void>;

  sendReaction(args: {
    sessionId: string;
    chatId: string;
    messageId: string;
    reaction: string;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<void>;

  getMediaBytes(args: {
    sessionId: string;
    chatId: string;
    messageId: string;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<{ bytes: Buffer; mimetype: string } | null>;

  publishTextStatus(args: {
    sessionId: string;
    text: string;
    backgroundColor?: string;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<void>;

  publishImageStatus(args: {
    sessionId: string;
    /** file.data may be a Buffer (encoded to base64 before hitting the repository) */
    file: { data: Buffer | string; mimetype: string };
    caption?: string;
    requesterCashierId?: string;
    requesterRole: Role;
  }): Promise<void>;
};

export function createChatService(deps: ChatServiceDeps): ChatService {
  const { getWhatsappSession, repository, nowFn } = deps;

  // Single rate-limiter instance shared across all method calls — keys by sessionId.
  // V1 LIMITATION: single-process — see rate-limiter.ts JSDoc.
  const limiter: RateLimiter = createRateLimiter({
    capacity: RATE_CAPACITY,
    refillIntervalMs: RATE_REFILL_INTERVAL_MS,
    nowFn,
  });

  /** Resolves session + enforces ownership. Throws on failure. */
  async function resolveAndAuthorize(
    sessionId: string,
    role: Role,
    requesterCashierId?: string,
  ): Promise<WhatsappSessionRow> {
    const session = await getWhatsappSession(sessionId);
    if (!session) throw new ChatSessionNotFoundError(sessionId);
    if (!isOwner(session, role, requesterCashierId)) throw new ChatForbiddenError();
    return session;
  }

  return {
    async listChats({ sessionId, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);
      return repository.listChats(session.sessionName);
    },

    async getChatHistory({ sessionId, chatId, limit, offset, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);
      return repository.getChatHistory(session.sessionName, chatId, { limit, offset });
    },

    async sendText({ sessionId, chatId, text, replyTo, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);

      // Rate check (text + photo share the same bucket per session)
      if (!limiter.tryConsume(sessionId)) {
        throw new ChatRateLimitError();
      }

      return repository.sendText(session.sessionName, chatId, text, replyTo);
    },

    async sendPhoto({ sessionId, chatId, file, caption, replyTo, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);

      // Rate check — same bucket as sendText (per design §6)
      if (!limiter.tryConsume(sessionId)) {
        throw new ChatRateLimitError();
      }

      // Convert Buffer to base64 string for WAHA (ADR-4: base64 inline payload)
      const fileData =
        typeof file.data === 'string'
          ? file.data
          : file.data.toString('base64');

      // Note: sendImage does not accept replyTo per current WAHA client signature.
      // caption is forwarded; replyTo stored for future WAHA API support.
      return repository.sendImage(session.sessionName, chatId, {
        data: fileData,
        mimetype: file.mimetype,
      }, caption);
    },

    async sendReaction({ sessionId, chatId: _chatId, messageId, reaction, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);

      // NOTE: sendReaction does NOT consume from the rate bucket (design §6).
      return repository.sendReaction(session.sessionName, messageId, reaction);
    },

    async getMediaBytes({ sessionId, chatId, messageId, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);
      return repository.getMediaBytes(session.sessionName, chatId, messageId);
    },

    async publishTextStatus({ sessionId, text, backgroundColor, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);

      // Statuses share the same per-session bucket as sendText/sendPhoto.
      if (!limiter.tryConsume(sessionId)) {
        throw new ChatRateLimitError();
      }

      return repository.sendTextStatus(session.sessionName, {
        text,
        ...(backgroundColor !== undefined ? { backgroundColor } : {}),
      });
    },

    async publishImageStatus({ sessionId, file, caption, requesterCashierId, requesterRole }) {
      const session = await resolveAndAuthorize(sessionId, requesterRole, requesterCashierId);

      if (!limiter.tryConsume(sessionId)) {
        throw new ChatRateLimitError();
      }

      const fileData =
        typeof file.data === 'string'
          ? file.data
          : file.data.toString('base64');

      return repository.sendImageStatus(session.sessionName, {
        file: { data: fileData, mimetype: file.mimetype },
        ...(caption !== undefined ? { caption } : {}),
      });
    },
  };
}

// ── Default wiring ─────────────────────────────────────────────────────────────

/**
 * Creates a ChatService wired to real DB + WAHA client.
 * Call lazily from the controller (not at module load time).
 */
export async function createDefaultChatService(): Promise<ChatService> {
  const { prisma } = await import('../../persistence/prisma/client.js');
  const { createDefaultChatRepository } = await import('./chat.repository.js');

  const repository = await createDefaultChatRepository();

  return createChatService({
    getWhatsappSession: async (sessionId) => {
      const row = await prisma.whatsappSession.findUnique({
        where: { id: sessionId },
        select: { id: true, sessionName: true, cashierId: true },
      });
      return row;
    },
    repository,
  });
}
