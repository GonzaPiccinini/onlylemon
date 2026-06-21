import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { chatService, type ChatScope } from "@/api/chat.service";

// ---------------------------------------------------------------------------
// Error message helpers
// ---------------------------------------------------------------------------

function publishStatusErrorMessage(error: unknown): string {
  if (isAxiosError<{ message?: string; error?: string }>(error)) {
    const status = error.response?.status;
    if (status === 429) {
      return "Estás publicando muy rápido, esperá un momento";
    }
    if (status === 403) {
      return "No tenés permiso para publicar estados en esta sesión";
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
  return "No se pudo publicar el estado";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutations for publishing WhatsApp statuses (stories) on a session.
 *
 * No query invalidation needed — published statuses don't appear anywhere in
 * the dashboard (WAHA has no status-viewing API), so success is just a toast.
 */
export const usePublishStatus = (scope: ChatScope, sessionId: string) => {
  const publishText = useMutation<
    void,
    unknown,
    { text: string; backgroundColor?: string }
  >({
    mutationFn: (body) => chatService.publishTextStatus(scope, sessionId, body),
    onSuccess: () => {
      toast.success("Estado publicado");
    },
    onError: (error) => {
      toast.error(publishStatusErrorMessage(error));
    },
  });

  const publishImage = useMutation<
    void,
    unknown,
    { file: File; caption?: string }
  >({
    mutationFn: ({ file, caption }) =>
      chatService.publishImageStatus(scope, sessionId, file, caption),
    onSuccess: () => {
      toast.success("Estado publicado");
    },
    onError: (error) => {
      toast.error(publishStatusErrorMessage(error));
    },
  });

  return { publishText, publishImage };
};
