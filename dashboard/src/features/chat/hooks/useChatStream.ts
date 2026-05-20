import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chatService, type ChatScope } from "@/api/chat.service";
import type { ChatMessageEvent, ChatMessage, ChatReactionEvent } from "@/types/chat";
import { chatHistoryKey } from "./useChatHistory";
import { chatListKey } from "./useChatList";

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
 * @param token  JWT for ?token= query param.  When null the hook is a no-op.
 * @param scope  Current scope — needed to build the correct cache keys.
 * @param activeSessionId  Currently open session (may be null).
 * @param activeChatId    Currently open chat (may be null).
 */
export const useChatStream = (
  token: string | null,
  scope: ChatScope,
  activeSessionId: string | null,
  activeChatId: string | null,
) => {
  const queryClient = useQueryClient();

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
            const firstPage = old.pages[0] ?? [];
            if (firstPage.some((m) => m.id === message.id)) {
              // Already in cache — no-op
              return old;
            }
            // Prepend new message to first page (newest-first ordering)
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
  }, [activeChatId, activeSessionId, queryClient, scope, token]);
};
