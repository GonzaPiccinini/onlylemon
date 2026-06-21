import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { chatService, type ChatScope } from "@/api/chat.service";
import type { ChatMessage } from "@/types/chat";
import { chatHistoryKey } from "./useChatHistory";

// ---------------------------------------------------------------------------
// Error message helpers
// ---------------------------------------------------------------------------

function sendReactionErrorMessage(error: unknown): string {
  if (isAxiosError<{ message?: string; error?: string }>(error)) {
    const status = error.response?.status;
    if (status === 403) {
      return "No tenés permiso para reaccionar en esta sesión";
    }
    const msg = error.response?.data?.message ?? error.response?.data?.error;
    if (msg) return msg;
  }
  return "No se pudo enviar la reacción";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook for sending or removing an emoji reaction on a message.
 *
 * Optimistic update strategy:
 *   1. On `mutate`: immediately update the reactions array for the target
 *      message in the history cache.
 *   2. On `onError`: roll back the reactions to the previous state.
 *
 * Pass an empty string for `reaction` to remove the existing reaction.
 */
export const useSendReaction = (
  scope: ChatScope,
  sessionId: string,
  chatId: string,
) => {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    unknown,
    { messageId: string; reaction: string },
    { previousData: { pages: ChatMessage[][]; pageParams: (string | undefined)[] } | undefined }
  >({
    mutationFn: ({ messageId, reaction }) =>
      chatService.sendReaction(scope, sessionId, chatId, messageId, reaction),

    onMutate: async ({ messageId, reaction }) => {
      const histKey = chatHistoryKey(scope, sessionId, chatId);
      await queryClient.cancelQueries({ queryKey: histKey });

      const previousData = queryClient.getQueryData<{
        pages: ChatMessage[][];
        pageParams: (string | undefined)[];
      }>(histKey);

      // Optimistically update the reactions
      queryClient.setQueryData<{ pages: ChatMessage[][]; pageParams: (string | undefined)[] }>(
        histKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((msg) => {
                if (msg.id !== messageId) return msg;
                // Remove existing fromMe reaction, add new one (or leave empty)
                const filtered = msg.reactions.filter((r) => !r.fromMe);
                const next =
                  reaction !== ""
                    ? [...filtered, { emoji: reaction, fromMe: true }]
                    : filtered;
                return { ...msg, reactions: next };
              }),
            ),
          };
        },
      );

      return { previousData };
    },

    onError: (error, _vars, context) => {
      // Roll back
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(
          chatHistoryKey(scope, sessionId, chatId),
          context.previousData,
        );
      }
      toast.error(sendReactionErrorMessage(error));
    },
  });
};
