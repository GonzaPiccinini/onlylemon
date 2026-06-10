import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { chatService, type ChatScope } from "@/api/chat.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Query key of the session list that feeds the SessionPicker, per scope. */
function sessionsKey(scope: ChatScope): readonly unknown[] {
  return scope.kind === "cashier"
    ? (["cashier", "me", "sessions"] as const)
    : (["admin", "cashiers", scope.cashierId, "sessions"] as const);
}

function aliasErrorMessage(error: unknown): string {
  if (isAxiosError<{ message?: string; error?: string }>(error)) {
    const status = error.response?.status;
    if (status === 403) return "No tenés permiso para renombrar esta sesión";
    if (status === 400) return "El alias no es válido (máximo 60 caracteres)";
    const msg = error.response?.data?.message ?? error.response?.data?.error;
    if (msg) return msg;
  }
  return "No se pudo guardar el alias";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Sets (or clears) a session's alias and refreshes the session list so the
 * SessionPicker reflects the new name.
 */
export const useSetSessionAlias = (scope: ChatScope) => {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, { sessionId: string; alias: string | null }>({
    mutationFn: ({ sessionId, alias }) =>
      chatService.setSessionAlias(scope, sessionId, alias),
    onSuccess: async () => {
      toast.success("Alias guardado");
      await queryClient.invalidateQueries({ queryKey: sessionsKey(scope) });
    },
    onError: (error) => {
      toast.error(aliasErrorMessage(error));
    },
  });
};
