import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { chatService, type ChatScope } from "@/api/chat.service";
import type { ChatMessage } from "@/types/chat";
import { chatHistoryKey } from "./useChatHistory";
import { chatListKey } from "./useChatList";

// ---------------------------------------------------------------------------
// Optimistic tile reconciliation heuristic (Design §13 #16)
// ---------------------------------------------------------------------------
// When the outbound message arrives as a WAHA webhook echo (fromMe=true) via
// the SSE stream, the SSE handler in useChatStream will try to add it.  To
// prevent a duplicate tile we remove the optimistic message when a real
// inbound message matches:
//   (chatId, body, fromMe=true, timestamp within ±5 000 ms)
// This reconciliation is done inside the SSE handler in useChatStream by
// checking whether a message with matching body+fromMe+timestamp is already
// in the cache.  The mutation itself only inserts the optimistic tile and
// rolls it back on error.

const RECONCILE_WINDOW_MS = 5_000;

export type OptimisticMessage = ChatMessage & { _optimistic: true };

// ---------------------------------------------------------------------------
// Error message helpers
// ---------------------------------------------------------------------------

function sendTextErrorMessage(error: unknown): string {
  if (isAxiosError<{ message?: string; error?: string }>(error)) {
    const status = error.response?.status;
    if (status === 429) {
      return "Estás enviando mensajes muy rápido, esperá un momento";
    }
    if (status === 403) {
      return "No tenés permiso para enviar mensajes en esta sesión";
    }
    const msg = error.response?.data?.message ?? error.response?.data?.error;
    if (msg) return msg;
  }
  return "No se pudo enviar el mensaje";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook for sending a plain text message.
 *
 * Optimistic update strategy:
 *   1. On `mutate`: insert a temporary tile (local uuid, fromMe:true, now()).
 *   2. On `onError`: remove the optimistic tile and show a toast.
 *   3. On SSE echo (useChatStream): the echo arrives with a real messageId.
 *      useChatStream skips adding the SSE message if a matching optimistic tile
 *      exists (same chatId, body, fromMe, timestamp within ±5s).
 *   4. The optimistic tile is removed as part of error rollback only — on
 *      success it is superseded by the SSE echo which replaces it.
 *
 * Note: the SSE handler is responsible for removing the optimistic tile on
 * success; mutations here only manage error rollback.
 */
export const useSendMessage = (
  scope: ChatScope,
  sessionId: string,
  chatId: string,
) => {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    unknown,
    { text: string; replyTo?: string },
    { optimisticId: string }
  >({
    mutationFn: ({ text, replyTo }) =>
      chatService.sendText(scope, sessionId, chatId, { text, replyTo }),

    onMutate: async ({ text }) => {
      // Cancel any in-flight refetches to avoid overwriting the optimistic update
      const histKey = chatHistoryKey(scope, sessionId, chatId);
      await queryClient.cancelQueries({ queryKey: histKey });

      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const optimisticMessage: OptimisticMessage = {
        _optimistic: true,
        id: optimisticId,
        timestamp: Date.now(),
        fromMe: true,
        body: text,
        hasMedia: false,
        mediaMimetype: null,
        isViewOnce: false,
        reactions: [],
        quotedMessage: null,
        senderName: null,
      };

      queryClient.setQueryData<{ pages: ChatMessage[][]; pageParams: (string | undefined)[] }>(
        histKey,
        (old) => {
          if (!old) {
            return {
              pages: [[optimisticMessage]],
              pageParams: [undefined],
            };
          }
          const firstPage = old.pages[0] ?? [];
          return {
            ...old,
            pages: [[optimisticMessage, ...firstPage], ...old.pages.slice(1)],
          };
        },
      );

      return { optimisticId };
    },

    onError: (error, _vars, context) => {
      if (context?.optimisticId) {
        // Roll back the optimistic tile
        const histKey = chatHistoryKey(scope, sessionId, chatId);
        queryClient.setQueryData<{ pages: ChatMessage[][]; pageParams: (string | undefined)[] }>(
          histKey,
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) =>
                page.filter((m) => m.id !== context.optimisticId),
              ),
            };
          },
        );
      }
      toast.error(sendTextErrorMessage(error));
      // Invalidate list to keep sidebar fresh
      void queryClient.invalidateQueries({ queryKey: chatListKey(scope, sessionId) });
    },
  });
};

// ---------------------------------------------------------------------------
// Export reconciliation window so useChatStream can import it
// ---------------------------------------------------------------------------
export { RECONCILE_WINDOW_MS };
