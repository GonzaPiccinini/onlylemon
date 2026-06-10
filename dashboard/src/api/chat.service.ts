/**
 * chat.service.ts — Dashboard HTTP service for the worker chat API.
 *
 * Both cashier-scoped and admin-scoped operations are covered here via a scope
 * discriminator passed by the caller.  The scope controls which URL prefix is
 * used so there is no duplicated logic between the two role paths.
 *
 * Media auth note:
 *   The worker GET .../media route only accepts an Authorization header — it
 *   does NOT support a ?token= query parameter.  EventSource and bare <img src>
 *   cannot inject the Authorization header, so this service exposes
 *   `fetchMediaBlob` (which uses the shared Axios instance that already injects
 *   the Bearer token) instead of a plain URL getter.  Components must call
 *   URL.createObjectURL on the returned Blob to display media.
 *
 * SSE stream:
 *   `getChatStreamUrl(token)` returns the fully-composed URL for the realtime
 *   chat SSE endpoint.  The worker's realtime route DOES accept ?token= for
 *   EventSource compatibility, so a plain URL is correct here.
 */

import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import { env } from "@/config/env";
import type {
  ChatListEntry,
  ChatMessage,
  SendReactionRequest,
  SendTextRequest,
} from "@/types/chat";

// ---------------------------------------------------------------------------
// Scope discriminator
// ---------------------------------------------------------------------------

/**
 * Cashier scope — uses the cashier-owned session URL group.
 * cashierId is included so localStorage keys can be scoped per-cashier on
 * shared devices (Design Addendum §Session selector persistence).
 * The JWT still carries auth — this is only used for key namespacing.
 */
export type CashierScope = { kind: "cashier"; cashierId: string };

/**
 * Admin scope — uses the admin URL group which requires an explicit cashierId
 * so the worker can resolve the correct session owner.
 */
export type AdminScope = { kind: "admin"; cashierId: string };

export type ChatScope = CashierScope | AdminScope;

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function chatsUrl(scope: ChatScope, sessionId: string): string {
  return scope.kind === "cashier"
    ? endpoints.chat.cashierChats(sessionId)
    : endpoints.chat.adminChats(scope.cashierId, sessionId);
}

function messagesUrl(scope: ChatScope, sessionId: string, chatId: string): string {
  return scope.kind === "cashier"
    ? endpoints.chat.cashierMessages(sessionId, chatId)
    : endpoints.chat.adminMessages(scope.cashierId, sessionId, chatId);
}

function reactionsUrl(
  scope: ChatScope,
  sessionId: string,
  chatId: string,
  messageId: string,
): string {
  return scope.kind === "cashier"
    ? endpoints.chat.cashierReactions(sessionId, chatId, messageId)
    : endpoints.chat.adminReactions(scope.cashierId, sessionId, chatId, messageId);
}

function mediaUrl(
  scope: ChatScope,
  sessionId: string,
  chatId: string,
  messageId: string,
): string {
  return scope.kind === "cashier"
    ? endpoints.chat.cashierMedia(sessionId, chatId, messageId)
    : endpoints.chat.adminMedia(scope.cashierId, sessionId, chatId, messageId);
}

function sendMediaUrl(scope: ChatScope, sessionId: string, chatId: string): string {
  return scope.kind === "cashier"
    ? endpoints.chat.cashierSendMedia(sessionId, chatId)
    : endpoints.chat.adminSendMedia(scope.cashierId, sessionId, chatId);
}

function statusTextUrl(scope: ChatScope, sessionId: string): string {
  return scope.kind === "cashier"
    ? endpoints.chat.cashierStatusText(sessionId)
    : endpoints.chat.adminStatusText(scope.cashierId, sessionId);
}

function statusImageUrl(scope: ChatScope, sessionId: string): string {
  return scope.kind === "cashier"
    ? endpoints.chat.cashierStatusImage(sessionId)
    : endpoints.chat.adminStatusImage(scope.cashierId, sessionId);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const chatService = {
  /**
   * List chats for a session, sorted most-recent-first by the worker.
   * `limit`/`offset` drive WAHA-backed offset pagination so the list can be
   * loaded incrementally ("cargar más chats") instead of all at once.
   */
  async listChats(
    scope: ChatScope,
    sessionId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<ChatListEntry[]> {
    const { data } = await http.get<ChatListEntry[]>(chatsUrl(scope, sessionId), {
      params: {
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts.offset ? { offset: opts.offset } : {}),
      },
    });
    return data;
  },

  /**
   * Fetch paginated message history for a chat, most-recent-first.
   * `limit` defaults to 30 on the worker side when omitted.
   * `offset` skips the N most-recent messages (WAHA-backed pagination) so the
   * UI can walk back through older messages without re-fetching the same set.
   */
  async getChatHistory(
    scope: ChatScope,
    sessionId: string,
    chatId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<ChatMessage[]> {
    const { data } = await http.get<ChatMessage[]>(messagesUrl(scope, sessionId, chatId), {
      params: {
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts.offset ? { offset: opts.offset } : {}),
      },
    });
    return data;
  },

  /**
   * Send a plain text message, optionally quoting a previous message.
   * `replyTo` is the id of the message being quoted.
   */
  async sendText(
    scope: ChatScope,
    sessionId: string,
    chatId: string,
    body: SendTextRequest,
  ): Promise<void> {
    await http.post(messagesUrl(scope, sessionId, chatId), body);
  },

  /**
   * Send an emoji reaction (or remove one by passing an empty string).
   */
  async sendReaction(
    scope: ChatScope,
    sessionId: string,
    chatId: string,
    messageId: string,
    reaction: string,
  ): Promise<void> {
    const body: SendReactionRequest = { reaction };
    await http.post(reactionsUrl(scope, sessionId, chatId, messageId), body);
  },

  /**
   * Send an image (JPEG / PNG / WebP) as a multipart upload.
   *
   * V2 deferral: `replyTo` is intentionally NOT accepted here — the worker
   * ignores it and the spec amendment explicitly defers photo-quoting to V2.
   * The composer must not offer reply mode when an attachment is present.
   */
  async sendPhoto(
    scope: ChatScope,
    sessionId: string,
    chatId: string,
    file: File,
    caption?: string,
  ): Promise<void> {
    const form = new FormData();
    form.append("file", file);
    if (caption !== undefined && caption !== "") {
      form.append("caption", caption);
    }
    // NOTE: replyTo is intentionally NOT appended (V2 deferral — spec amendment).
    await http.post(sendMediaUrl(scope, sessionId, chatId), form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /**
   * Fetch raw media bytes for a message via the worker's media proxy.
   *
   * IMPORTANT — why fetchMediaBlob instead of getMediaUrl:
   *   The worker's GET .../media route only accepts an Authorization header.
   *   It does NOT support ?token= query auth.  A bare <img src> or
   *   EventSource cannot send Authorization headers, so the dashboard must
   *   fetch bytes through Axios (which injects Bearer automatically via the
   *   http interceptor) and create an object URL from the resulting Blob.
   *   Components should call URL.createObjectURL(blob) and revoke when
   *   unmounted to avoid memory leaks.
   *
   * Returns null if the worker returns 404 (media unavailable — e.g. deleted
   * from WAHA/R2 storage).  All other errors are rethrown.
   */
  async fetchMediaBlob(
    scope: ChatScope,
    sessionId: string,
    chatId: string,
    messageId: string,
  ): Promise<Blob | null> {
    try {
      const { data } = await http.get<Blob>(
        mediaUrl(scope, sessionId, chatId, messageId),
        { responseType: "blob" },
      );
      return data;
    } catch (error: unknown) {
      // 404 = media unavailable — caller shows placeholder
      if (
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Publish a text status (story) on the session's WhatsApp account.
   * `backgroundColor` is an optional hex color (e.g. "#38b42f").
   */
  async publishTextStatus(
    scope: ChatScope,
    sessionId: string,
    body: { text: string; backgroundColor?: string },
  ): Promise<void> {
    await http.post(statusTextUrl(scope, sessionId), body);
  },

  /**
   * Publish an image status (story) as a multipart upload, mirroring sendPhoto.
   */
  async publishImageStatus(
    scope: ChatScope,
    sessionId: string,
    file: File,
    caption?: string,
  ): Promise<void> {
    const form = new FormData();
    form.append("file", file);
    if (caption !== undefined && caption !== "") {
      form.append("caption", caption);
    }
    await http.post(statusImageUrl(scope, sessionId), form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /**
   * Build the fully-composed SSE stream URL for the realtime chat endpoint.
   *
   * The worker's GET /api/realtime/chat/stream route accepts ?token= (mirroring
   * the existing runtime-state SSE) so EventSource can pass auth without the
   * Authorization header.
   *
   * `env.realtimeBaseUrl` already resolves to `<apiBase>/realtime`, so we
   * append `/chat/stream` to get the correct path without double-prefixing /api.
   */
  getChatStreamUrl(token: string): string {
    return `${env.realtimeBaseUrl}/chat/stream?token=${encodeURIComponent(token)}`;
  },
};
