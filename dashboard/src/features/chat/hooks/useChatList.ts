import { useQuery } from "@tanstack/react-query";
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

/**
 * Fetches the list of chats for a given session.
 *
 * Disabled when `sessionId` is null (no session selected yet).
 * `staleTime` is set conservatively — the SSE stream keeps the list
 * fresh for active sessions, so aggressive polling is not needed.
 */
export const useChatList = (scope: ChatScope, sessionId: string | null) =>
  useQuery<ChatListEntry[]>({
    queryKey: chatListKey(scope, sessionId),
    queryFn: () => chatService.listChats(scope, sessionId!),
    enabled: sessionId !== null,
    staleTime: 60_000,
  });
