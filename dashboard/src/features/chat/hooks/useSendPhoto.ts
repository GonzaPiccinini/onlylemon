import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { chatService, type ChatScope } from "@/api/chat.service";
import { chatHistoryKey } from "./useChatHistory";

// ---------------------------------------------------------------------------
// Error message helpers
// ---------------------------------------------------------------------------

function sendPhotoErrorMessage(error: unknown): string {
  if (isAxiosError<{ message?: string; error?: string }>(error)) {
    const status = error.response?.status;
    if (status === 429) {
      return "Estás enviando mensajes muy rápido, esperá un momento";
    }
    if (status === 403) {
      return "No tenés permiso para enviar fotos en esta sesión";
    }
    if (status === 413) {
      return "La imagen es demasiado grande (máximo 5 MB)";
    }
    if (status === 415) {
      return "Formato de imagen no soportado. Usá JPEG, PNG o WebP";
    }
    const msg = error.response?.data?.message ?? error.response?.data?.error;
    if (msg) return msg;
  }
  return "No se pudo enviar la foto";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook for sending a photo (JPEG / PNG / WebP).
 *
 * Optimistic strategy: simpler than text — no body to match against the SSE
 * echo.  We do NOT insert an optimistic tile; instead we show a sending state
 * via `isPending` and invalidate history on success so the SSE echo (or a
 * refetch) populates the new tile.
 *
 * V2 deferral: replyTo is intentionally NOT accepted (spec-amendments).
 */
export const useSendPhoto = (
  scope: ChatScope,
  sessionId: string,
  chatId: string,
) => {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, { file: File; caption?: string }>({
    mutationFn: ({ file, caption }) =>
      chatService.sendPhoto(scope, sessionId, chatId, file, caption),

    onSuccess: async () => {
      // Invalidate history so the SSE echo or next fetch shows the new tile
      await queryClient.invalidateQueries({
        queryKey: chatHistoryKey(scope, sessionId, chatId),
      });
    },

    onError: (error) => {
      toast.error(sendPhotoErrorMessage(error));
    },
  });
};
