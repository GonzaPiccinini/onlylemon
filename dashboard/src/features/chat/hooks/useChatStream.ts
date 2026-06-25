import { useCallback, useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { chatService, type ChatScope } from "@/api/chat.service";
import type {
  ChatMessageEvent,
  ChatMessage,
  ChatReactionEvent,
  ChatListEntry,
} from "@/types/chat";
import { chatHistoryKey } from "./useChatHistory";
import { chatListKey } from "./useChatList";
import { RECONCILE_WINDOW_MS, type OptimisticMessage } from "./useSendMessage";
import { toMillis } from "../time";
import { resolveContactTitle } from "../contact";
import { showChatNotification } from "../notifications";

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

/** Reads the cached chat-list entry for a chat, to resolve its display title. */
function findChatListEntry(
  queryClient: QueryClient,
  scope: ChatScope,
  sessionId: string,
  chatId: string,
): ChatListEntry | null {
  const data = queryClient.getQueryData<{ pages: ChatListEntry[][] }>(
    chatListKey(scope, sessionId),
  );
  if (!data) return null;
  for (const page of data.pages) {
    const found = page.find((entry) => entry.chatId === chatId);
    if (found) return found;
  }
  return null;
}

/** Short human label for a media-only message (no text body). */
function mediaPlaceholder(mimetype: string | null): string {
  if (!mimetype) return "📎 Archivo";
  if (mimetype.startsWith("image/")) return "📷 Foto";
  if (mimetype.startsWith("video/")) return "🎥 Video";
  if (mimetype.startsWith("audio/")) return "🎙️ Audio";
  if (mimetype === "application/pdf") return "📄 PDF";
  return "📎 Archivo";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Opens a single EventSource connection to the realtime chat SSE stream.
 *
 * Mirrors `useCashierRuntimeStateStream` exactly:
 *   - EventSource opened in a useEffect, closed on unmount.
 *   - Browser default reconnect (no custom backoff).
 *   - onerror falls back to query invalidation.
 *
 * On `chat-message-received`:
 *   - Merges the new message into the history cache for the matching
 *     (sessionId, chatId).  De-dupes by message `id`.
 *   - Bumps / invalidates the chat list entry for the matching chat.
 *
 * On `chat-message-reaction`:
 *   - Updates the matching message's `reactions` array in the history cache.
 *
 * The hook processes events for ALL visible chats, not just the active one,
 * so that the chat list unread counters / timestamps stay current.
 *
 * Unread tracking: an incoming message (`!fromMe`) for a chat that is NOT the
 * one currently open marks that chatId as unread (drives the notification dot
 * in the chat list). Opening a chat clears it via the returned `markChatRead`.
 *
 * @param token  JWT for ?token= query param.  When null the hook is a no-op.
 * @param scope  Current scope — needed to build the correct cache keys.
 * @param activeSessionId  Currently open session (may be null).
 * @param activeChatId    Currently open chat (may be null).
 * @returns `unreadChatIds` set and a `markChatRead(chatId)` clearer.
 */
export const useChatStream = (
  token: string | null,
  scope: ChatScope,
  activeSessionId: string | null,
  activeChatId: string | null,
  /** Called when a chat notification is clicked — opens that session + chat. */
  onOpenChat?: (sessionId: string, chatId: string) => void,
) => {
  const queryClient = useQueryClient();

  // Set of chatIds with unread incoming messages. Drives the chat-list dot.
  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Clear a chat's unread flag — called by the page when a chat is opened.
  const markChatRead = useCallback((chatId: string) => {
    setUnreadChatIds((prev) => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const url = chatService.getChatStreamUrl(token);
    const source = new EventSource(url);

    // ------------------------------------------------------------------
    // chat-message-received
    // ------------------------------------------------------------------
    source.addEventListener("chat-message-received", (event) => {
      try {
        const payload = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as ChatMessageEvent;

        const { sessionId, chatId, message } = payload;

        // Merge into history cache for the matching (sessionId, chatId).
        // The history cache holds pages (InfiniteQuery), so we setQueryData
        // at the infinite query key to prepend the message to the first page,
        // de-duping by id.
        const histKey = chatHistoryKey(scope, sessionId, chatId);
        queryClient.setQueryData<{ pages: ChatMessage[][]; pageParams: (string | undefined)[] }>(
          histKey,
          (old) => {
            if (!old) return old;
            // Already in cache by real id (e.g. duplicate echo) — no-op.
            if (old.pages.some((page) => page.some((m) => m.id === message.id))) {
              return old;
            }
            // Reconcile: this echo may supersede an optimistic tile we inserted
            // on send (different local id). Drop the matching optimistic tile so
            // the message doesn't appear twice. Match by side + body + a ±5s
            // timestamp window (units normalized — optimistic is ms, echo may be
            // seconds). Only fromMe echoes can match an optimistic tile.
            const firstPage = (old.pages[0] ?? []).filter((m) => {
              if (!(m as Partial<OptimisticMessage>)._optimistic) return true;
              const supersededByEcho =
                m.fromMe === message.fromMe &&
                m.body === message.body &&
                Math.abs(toMillis(m.timestamp) - toMillis(message.timestamp)) <=
                  RECONCILE_WINDOW_MS;
              return !supersededByEcho;
            });
            // Prepend new message to first page (newest-first ordering;
            // chat-page re-sorts by timestamp for display).
            return {
              ...old,
              pages: [
                [message, ...firstPage],
                ...old.pages.slice(1),
              ],
            };
          },
        );

        // Bump the chat list entry's lastMessageTimestamp for ALL sessions
        // (keeps list ordering correct even for non-active chats).
        // We invalidate instead of surgically updating to keep the logic simple.
        void queryClient.invalidateQueries({
          queryKey: chatListKey(scope, sessionId),
        });

        // The fan-out chatId form may not match the chatId the OPEN thread is
        // keyed on. The chat list / history use the phone JID (`@c.us`) coming
        // from `listChats`, but the SSE event's chatId can arrive in a different
        // form (`@lid`, or a fallback to the raw `payload.from`) when the
        // canonical resolver can't find the phone JID in the webhook payload.
        // When that happens the surgical setQueryData above writes to a
        // different cache bucket and the open conversation never updates — even
        // though the chat list (keyed only by sessionId) refreshes. That is the
        // "messages show in the contact list but not in the open chat" bug.
        //
        // Guarantee the open thread reflects the new message by invalidating its
        // history query whenever a message lands in the active session, so it
        // refetches from WAHA (which returns the message under the chat's
        // canonical id regardless of the event's chatId form). Gated on the
        // active session so unrelated sessions don't trigger a refetch.
        if (
          activeSessionId &&
          activeChatId &&
          sessionId === activeSessionId
        ) {
          void queryClient.invalidateQueries({
            queryKey: chatHistoryKey(scope, activeSessionId, activeChatId),
          });
        }

        // Unread indicator: flag the chat when an INCOMING message arrives for a
        // chat that is not the one currently open. The active chat is excluded
        // (the user is already looking at it) and own (fromMe) echoes never count.
        if (chatId && !message.fromMe && chatId !== activeChatId) {
          setUnreadChatIds((prev) =>
            prev.has(chatId) ? prev : new Set(prev).add(chatId),
          );
        }

        // Auto-mark-read: an incoming message that lands while the cashier is
        // actively viewing a chat in this session is marked read on WhatsApp
        // immediately (blue ticks), mirroring WhatsApp Web with the conversation
        // open. Gated on tab visibility + active session; we send to the
        // canonical activeChatId because the event's chatId may arrive in a
        // different JID form (@lid vs @c.us). markSeen is idempotent, so if the
        // message was for another chat in the session it's a harmless no-op.
        if (
          !message.fromMe &&
          !document.hidden &&
          activeSessionId &&
          activeChatId &&
          sessionId === activeSessionId
        ) {
          void chatService
            .markSeen(scope, activeSessionId, activeChatId)
            .catch(() => {});
        }

        // In-app browser notification (Option A). Suppress ONLY when the user is
        // actively viewing this exact chat: tab focused AND the message's session
        // is the one selected in the picker AND its chat is the open one. In every
        // other case — including a message that arrives on a session OTHER than
        // the selected one — notify. No-ops unless permission was granted.
        const viewingThisChat =
          !document.hidden &&
          sessionId === activeSessionId &&
          chatId === activeChatId;
        if (!message.fromMe && !viewingThisChat) {
          const entry =
            findChatListEntry(queryClient, scope, sessionId, chatId) ?? {
              chatId,
              displayName: null,
              lastMessageTimestamp: 0,
            };
          const { title } = resolveContactTitle(entry);
          const body = message.body.trim()
            ? message.body
            : message.hasMedia
              ? mediaPlaceholder(message.mediaMimetype)
              : "Nuevo mensaje";
          // Tag per session+chat so the same contact on different sessions does
          // not collapse into a single notification. Clicking opens that exact
          // session + chat (and clears its unread flag, since we're opening it).
          showChatNotification({
            title,
            body,
            tag: `${sessionId}:${chatId}`,
            onClick: () => {
              setUnreadChatIds((prev) => {
                if (!prev.has(chatId)) return prev;
                const next = new Set(prev);
                next.delete(chatId);
                return next;
              });
              onOpenChat?.(sessionId, chatId);
            },
          });
        }
      } catch {
        // Malformed event — ignore
      }
    });

    // ------------------------------------------------------------------
    // chat-message-reaction
    // ------------------------------------------------------------------
    source.addEventListener("chat-message-reaction", (event) => {
      try {
        const payload = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as ChatReactionEvent;

        const { sessionId, chatId, messageId, emoji, fromMe } = payload;

        const histKey = chatHistoryKey(scope, sessionId, chatId);
        queryClient.setQueryData<{ pages: ChatMessage[][]; pageParams: (string | undefined)[] }>(
          histKey,
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) =>
                page.map((msg) => {
                  if (msg.id !== messageId) return msg;
                  // Remove any existing reaction from the same sender side,
                  // then add the new one (or leave empty if reaction = "").
                  const filtered = msg.reactions.filter((r) => r.fromMe !== fromMe);
                  const next =
                    emoji !== ""
                      ? [...filtered, { emoji, fromMe }]
                      : filtered;
                  return { ...msg, reactions: next };
                }),
              ),
            };
          },
        );
      } catch {
        // Malformed event — ignore
      }
    });

    source.onerror = () => {
      // On error fall back to invalidating the active queries so the UI
      // refetches on reconnect.
      if (activeSessionId) {
        void queryClient.invalidateQueries({
          queryKey: chatListKey(scope, activeSessionId),
        });
        if (activeChatId) {
          void queryClient.invalidateQueries({
            queryKey: chatHistoryKey(scope, activeSessionId, activeChatId),
          });
        }
      }
    };

    return () => {
      source.close();
    };
  }, [activeChatId, activeSessionId, onOpenChat, queryClient, scope, token]);

  return { unreadChatIds, markChatRead };
};
