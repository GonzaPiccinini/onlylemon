import { useInfiniteQuery } from "@tanstack/react-query";
import { chatService, type ChatScope } from "@/api/chat.service";
import type { ChatMessage } from "@/types/chat";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const chatHistoryKey = (
  scope: ChatScope,
  sessionId: string | null,
  chatId: string | null,
) => ["chat", "history", scope, sessionId, chatId] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

/**
 * Fetches paginated message history for a chat using an infinite query.
 *
 * Pages use a numeric `offset` cursor (WAHA-backed): page 0 is the newest
 * PAGE_SIZE (50) messages, and `fetchNextPage()` loads the next older block
 * on demand by skipping the count already loaded — triggered by the "Cargar
 * mensajes anteriores" button. This avoids the old broken message-id cursor
 * that the worker ignored — which re-fetched the same newest page and produced
 * duplicate / out-of-order messages.
 *
 * Worker caps `limit` at 100 (HistoryQuerySchema), so 50 is well within range.
 *
 * Disabled when `chatId` is null (no chat selected yet).
 */
export const useChatHistory = (
  scope: ChatScope,
  sessionId: string | null,
  chatId: string | null,
) =>
  useInfiniteQuery<ChatMessage[], Error, { pages: ChatMessage[][] }, ReturnType<typeof chatHistoryKey>, number>({
    queryKey: chatHistoryKey(scope, sessionId, chatId),
    queryFn: ({ pageParam }) =>
      chatService.getChatHistory(scope, sessionId!, chatId!, {
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Fewer than a full page back means we've reached the start of history.
      if (lastPage.length < PAGE_SIZE) return undefined;
      // Next offset = total messages already loaded.
      return allPages.reduce((total, page) => total + page.length, 0);
    },
    enabled: sessionId !== null && chatId !== null,
    staleTime: 30_000,
  });
