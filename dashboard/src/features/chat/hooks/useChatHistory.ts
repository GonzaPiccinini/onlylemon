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

/**
 * Fetches paginated message history for a chat using an infinite query.
 *
 * Pages are keyed by the `before` cursor (oldest message id in the loaded page).
 * `fetchNextPage()` loads older messages by passing the last page's earliest
 * message id as the `before` cursor.
 *
 * Disabled when `chatId` is null (no chat selected yet).
 */
export const useChatHistory = (
  scope: ChatScope,
  sessionId: string | null,
  chatId: string | null,
) =>
  useInfiniteQuery<ChatMessage[], Error, { pages: ChatMessage[][] }, ReturnType<typeof chatHistoryKey>, string | undefined>({
    queryKey: chatHistoryKey(scope, sessionId, chatId),
    queryFn: ({ pageParam }) =>
      chatService.getChatHistory(scope, sessionId!, chatId!, {
        limit: 30,
        before: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      // If the page returned fewer than 30 items we've reached the end.
      if (lastPage.length < 30) return undefined;
      // The oldest message in the page becomes the next `before` cursor.
      return lastPage[lastPage.length - 1]?.id;
    },
    enabled: sessionId !== null && chatId !== null,
    staleTime: 30_000,
  });
