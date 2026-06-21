import { useInfiniteQuery } from "@tanstack/react-query";
import { chatService, type ChatScope } from "@/api/chat.service";
import type { ChatListEntry } from "@/types/chat";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const chatListKey = (scope: ChatScope, sessionId: string | null) =>
  ["chat", "list", scope, sessionId] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

/**
 * Fetches the chat list for a session using an infinite query with WAHA-backed
 * offset pagination: page 0 is the 20 most-recently-active chats, and
 * `fetchNextPage()` loads the next 20 older chats on demand ("cargar más
 * chats"). Pagination stops when a page returns fewer than PAGE_SIZE.
 *
 * Disabled when `sessionId` is null (no session selected yet).
 * `staleTime` is conservative — the SSE stream invalidates this query to keep
 * the list fresh for active sessions, so aggressive polling is not needed.
 */
export const useChatList = (scope: ChatScope, sessionId: string | null) =>
  useInfiniteQuery<
    ChatListEntry[],
    Error,
    { pages: ChatListEntry[][] },
    ReturnType<typeof chatListKey>,
    number
  >({
    queryKey: chatListKey(scope, sessionId),
    queryFn: ({ pageParam }) =>
      chatService.listChats(scope, sessionId!, {
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((total, page) => total + page.length, 0);
    },
    enabled: sessionId !== null,
    staleTime: 60_000,
  });
