/**
 * chat-fanout.ts
 *
 * Batch 11 — Wire processor fan-out to the real chat event bus.
 *
 * Provides factory functions that build the REAL mirrorChatMessage and
 * mirrorChatReaction implementations for getRealProcessor(). These factories:
 *   1. Receive the raw processor payload (keyed by WAHA sessionName).
 *   2. Resolve sessionName → { sessionId (DB id), cashierId } via the injected
 *      repository function (Design §8.4).
 *   3. If the session is NOT found: log warn('chat_fanout_session_not_found'),
 *      return — do NOT throw (fan-out is best-effort; must not trigger BullMQ retry).
 *   4. Build the ChatMessageEvent / ChatReactionEvent.
 *   5. Call publishChatMessage / publishChatReaction.
 *   6. Any error is caught + logged; never thrown (fan-out is best-effort).
 *
 * timestamp note: InboundMessageSchema does not parse a top-level timestamp for
 * message.any events, so the mirrorChatMessage payload's `timestamp` field may
 * be undefined. In that case we default to Date.now() so the SSE event always
 * carries a valid timestamp.
 *
 * Single-process V1 limitation: publishChatMessage/publishChatReaction use an
 * in-process EventEmitter. Redis pub/sub is the V2 upgrade path.
 */

import type { ChatMessageEvent, ChatReactionEvent, ChatMessage } from './chat.types.js';

// ---------------------------------------------------------------------------
// Deps type
// ---------------------------------------------------------------------------

export type ChatFanoutSession = {
  id: string;          // DB WhatsappSession.id (used as sessionId in bus events)
  cashierId: string;   // WhatsappSession.cashierId
  sessionName: string; // WAHA session name (for display continuity)
};

export type ChatFanoutLogger = {
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
};

export type ChatFanoutDeps = {
  /**
   * Resolves a WAHA sessionName to the DB WhatsappSession row.
   * Returns null (or resolves to null) when the session is not found.
   * Must NOT throw on not-found — only on infrastructure errors.
   */
  getSessionBySessionName: (sessionName: string) => Promise<ChatFanoutSession | null>;

  publishChatMessage: (event: ChatMessageEvent) => void;
  publishChatReaction: (event: ChatReactionEvent) => void;

  /**
   * Returns true when the phone (digits-only) belongs to one of the cashier's
   * own connected lines. Used to flag internal self-messages. Best-effort:
   * if it throws, fan-out treats the message as NOT an internal echo.
   */
  isOwnLinePhoneForCashier: (cashierId: string, phoneDigits: string) => Promise<boolean>;

  logger: ChatFanoutLogger;
};

// ---------------------------------------------------------------------------
// mirrorChatMessage payload shape (matches InboundProcessorDeps.mirrorChatMessage)
// ---------------------------------------------------------------------------

export type MirrorChatMessagePayload = {
  sessionName: string;
  chatId: string;
  messageId: string;
  timestamp?: number;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  mediaMimetype?: string | null;
  quotedMessage?: { id: string; body?: string | null; fromMe?: boolean } | null;
  /** Group-chat sender display name (null for 1:1 / outbound). */
  senderName?: string | null;
};

// ---------------------------------------------------------------------------
// mirrorChatReaction payload shape (matches InboundProcessorDeps.mirrorChatReaction)
// ---------------------------------------------------------------------------

export type MirrorChatReactionPayload = {
  sessionName: string;
  chatId: string;
  messageId: string;
  reaction: string;    // emoji, empty string = removed
  fromMe: boolean;
};

// ---------------------------------------------------------------------------
// Factory: createChatMessageFanout
// ---------------------------------------------------------------------------

/**
 * Returns a function matching the `mirrorChatMessage` dep signature.
 * Resolves sessionName → DB session, builds a ChatMessageEvent, publishes it.
 * Best-effort: never throws; missing session or any error is logged and swallowed.
 */
export function createChatMessageFanout(
  deps: ChatFanoutDeps,
): (payload: MirrorChatMessagePayload) => Promise<void> {
  return async function mirrorChatMessage(payload: MirrorChatMessagePayload): Promise<void> {
    try {
      const session = await deps.getSessionBySessionName(payload.sessionName);

      if (session === null) {
        deps.logger.warn(
          { sessionName: payload.sessionName },
          'chat_fanout_session_not_found',
        );
        return;
      }

      // Detect internal echo: inbound message whose sender is another connected
      // line of the same cashier. Best-effort — a failure must never block fan-out.
      let internalEcho = false;
      if (!payload.fromMe) {
        try {
          const counterpartyDigits = payload.chatId.split('@')[0].replace(/\D/g, '');
          internalEcho = await deps.isOwnLinePhoneForCashier(
            session.cashierId,
            counterpartyDigits,
          );
        } catch {
          internalEcho = false; // best-effort; never block fan-out on this check
        }
      }

      // Build the ChatMessage. Inbound messages have no reactions yet — emit [].
      // timestamp defaults to Date.now() when absent (see module JSDoc note).
      const message: ChatMessage = {
        id: payload.messageId,
        timestamp: payload.timestamp ?? Date.now(),
        fromMe: payload.fromMe,
        body: payload.body,
        hasMedia: payload.hasMedia,
        mediaMimetype: payload.mediaMimetype ?? null,
        reactions: [],
        quotedMessage: payload.quotedMessage
          ? {
              id: payload.quotedMessage.id,
              previewText: payload.quotedMessage.body ?? null,
              fromMe: payload.quotedMessage.fromMe ?? false,
            }
          : null,
        senderName: payload.senderName ?? null,
      };

      const event: ChatMessageEvent = {
        cashierId: session.cashierId,
        sessionId: session.id,
        sessionName: session.sessionName,
        chatId: payload.chatId,
        message,
        ...(internalEcho ? { internalEcho: true } : {}),
      };

      deps.publishChatMessage(event);
    } catch (err) {
      deps.logger.warn(
        { sessionName: payload.sessionName, err },
        'chat_fanout_message_error',
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Factory: createChatReactionFanout
// ---------------------------------------------------------------------------

/**
 * Returns a function matching the `mirrorChatReaction` dep signature.
 * Resolves sessionName → DB session, builds a ChatReactionEvent, publishes it.
 * Best-effort: never throws; missing session or any error is logged and swallowed.
 */
export function createChatReactionFanout(
  deps: ChatFanoutDeps,
): (payload: MirrorChatReactionPayload) => Promise<void> {
  return async function mirrorChatReaction(payload: MirrorChatReactionPayload): Promise<void> {
    try {
      const session = await deps.getSessionBySessionName(payload.sessionName);

      if (session === null) {
        deps.logger.warn(
          { sessionName: payload.sessionName },
          'chat_fanout_session_not_found',
        );
        return;
      }

      const event: ChatReactionEvent = {
        cashierId: session.cashierId,
        sessionId: session.id,
        sessionName: session.sessionName,
        chatId: payload.chatId,
        messageId: payload.messageId,
        emoji: payload.reaction,
        fromMe: payload.fromMe,
      };

      deps.publishChatReaction(event);
    } catch (err) {
      deps.logger.warn(
        { sessionName: payload.sessionName, err },
        'chat_fanout_reaction_error',
      );
    }
  };
}
