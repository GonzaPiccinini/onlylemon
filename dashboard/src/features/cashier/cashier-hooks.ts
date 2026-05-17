import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cashierService } from "@/api/cashier.service";
import { env } from "@/config/env";
import type { CashierConversionsFilters, CashierRuntimeState, ConvertLeadInput } from "@/types/domain";
import type { MyWhatsappSession, WhatsappLinkArtifacts, WhatsappSessionStatus } from "@/types/domain";

const cashierKeys = {
  sessions: ["cashier", "sessions"] as const,
  currentSession: ["cashier", "current-session"] as const,
  runtimeState: ["cashier", "runtime-state"] as const,
  searchLeads: (q: string) => ["cashier", "leads", "search", q] as const,
  conversions: (filters: CashierConversionsFilters) => ["cashier", "conversions", filters] as const,
  whatsappLinkState: ["cashier", "whatsapp-link-state"] as const,
  whatsappLinkStatus: ["cashier", "whatsapp-link-status"] as const,
  // Batch 5 — per-session
  mySessions: ["cashier", "me", "sessions"] as const,
  mySessionStatus: (sessionId: string) => ["cashier", "me", "sessions", sessionId, "status"] as const,
};

export const useCashierSessions = () =>
  useQuery({
    queryKey: cashierKeys.sessions,
    queryFn: cashierService.listSessions,
  });

export const useCurrentSession = () =>
  useQuery({
    queryKey: cashierKeys.currentSession,
    queryFn: cashierService.getCurrentSession,
  });

export const useStartSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cashierService.startSession,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashierKeys.currentSession }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.sessions }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.runtimeState }),
      ]);
    },
  });
};

export const useFinishSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cashierService.finishSession,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashierKeys.currentSession }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.sessions }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.runtimeState }),
      ]);
    },
  });
};

export const useCashierRuntimeState = (enabled = true) =>
  useQuery({
    queryKey: cashierKeys.runtimeState,
    queryFn: cashierService.getRuntimeState,
    enabled,
    // SSE pushes updates; this is just a safety-net refetch in case the
    // stream drops and the reconnect hasn't fired yet.
    refetchInterval: 60_000,
  });

export const useCashierRuntimeStateStream = (
  token: string | null,
  enabled = true,
) => {
  const queryClient = useQueryClient();
  const previousRuntimeRef = useRef<CashierRuntimeState | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      return;
    }

    const url = `${env.realtimeBaseUrl}/cashier/runtime-state/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    source.addEventListener("runtime-state", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as CashierRuntimeState;
        const previous = previousRuntimeRef.current;
        previousRuntimeRef.current = payload;

        queryClient.setQueryData(cashierKeys.runtimeState, payload);
        queryClient.setQueryData(cashierKeys.whatsappLinkStatus, {
          sessionName: payload.sessionName,
          status: payload.wahaStatus,
          linked: payload.wahaStatus === "WORKING",
        });

        // Sync mySessions list directly from the SSE payload (no extra HTTP).
        // Field mapping: status → wahaStatus, phone → whatsappPhoneNumber.
        queryClient.setQueryData(
          cashierKeys.mySessions,
          payload.sessions.map((s) => ({
            id: s.id,
            sessionName: s.sessionName,
            whatsappPhoneNumber: s.phone,
            wahaStatus: s.status,
            refreshCount: s.refreshCount,
            lastRefreshAt: s.lastRefreshAt,
          })),
        );

        // Detect changes that the runtime payload alone can't represent
        const sessionNameChanged = previous?.sessionName !== payload.sessionName;
        const workSessionChanged =
          previous?.hasActiveWorkSession !== payload.hasActiveWorkSession;

        if (sessionNameChanged) {
          void queryClient.invalidateQueries({ queryKey: cashierKeys.whatsappLinkState });
        }
        if (workSessionChanged) {
          // The runtime-state has only the boolean; refetch full Session DTO
          void queryClient.invalidateQueries({ queryKey: cashierKeys.currentSession });
          void queryClient.invalidateQueries({ queryKey: cashierKeys.sessions });
        }
      } catch {
        void queryClient.invalidateQueries({ queryKey: cashierKeys.runtimeState });
      }
    });

    source.onerror = () => {
      void queryClient.invalidateQueries({ queryKey: cashierKeys.runtimeState });
    };

    return () => {
      source.close();
    };
  }, [enabled, queryClient, token]);
};

export const useCreateConversion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, input }: { leadId: string; input: ConvertLeadInput }) =>
      cashierService.createConversion(leadId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cashier", "leads"] }),
        queryClient.invalidateQueries({ queryKey: ["cashier", "conversions"] }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.runtimeState }),
      ]);
    },
  });
};

export const useSearchCashierLeads = (q: string, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: cashierKeys.searchLeads(q),
    queryFn: () => cashierService.searchLeads(q),
    enabled: q.length > 0 && (options?.enabled ?? true),
  });

export const useCashierConversions = (filters: CashierConversionsFilters) =>
  useQuery({
    queryKey: cashierKeys.conversions(filters),
    queryFn: () => cashierService.listConversions(filters),
  });

export { cashierKeys };

export const useUpdateCashierAccount = () =>
  useMutation<void, unknown, { username?: string; password?: string }>({
    mutationFn: cashierService.updateAccount,
  });

export const useWhatsappLinkState = () =>
  useQuery({
    queryKey: cashierKeys.whatsappLinkState,
    queryFn: cashierService.getWhatsappLinkState,
  });

export const useStartWhatsappLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (phoneNumber: string) => cashierService.startWhatsappLink(phoneNumber),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashierKeys.whatsappLinkState });
    },
  });
};

export const useRefreshWhatsappLink = () =>
  useMutation({
    mutationFn: cashierService.refreshWhatsappLink,
  });

export const useResetWhatsappLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cashierService.resetWhatsappLink,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashierKeys.whatsappLinkState });
    },
  });
};

export const useWhatsappLinkStatus = () =>
  useQuery({
    queryKey: cashierKeys.whatsappLinkStatus,
    queryFn: cashierService.getWhatsappLinkStatus,
    refetchInterval: 5_000,
  });

export const useCompleteWhatsappLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionName: string) => cashierService.completeWhatsappLink(sessionName),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashierKeys.whatsappLinkState }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.whatsappLinkStatus }),
      ]);
    },
  });
};

// ---------------------------------------------------------------------------
// Batch 5 — per-session hooks
// ---------------------------------------------------------------------------

export const useMySessions = () =>
  useQuery<MyWhatsappSession[]>({
    queryKey: cashierKeys.mySessions,
    queryFn: cashierService.listMySessions,
  });

export const useCreateMySession = () => {
  const queryClient = useQueryClient();
  return useMutation<MyWhatsappSession, unknown, void>({
    mutationFn: () => cashierService.createMySession(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashierKeys.mySessions }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.runtimeState }),
      ]);
    },
  });
};

export const useDeleteMySession = () => {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (sessionId: string) => cashierService.deleteMySession(sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashierKeys.mySessions }),
        queryClient.invalidateQueries({ queryKey: cashierKeys.runtimeState }),
      ]);
    },
  });
};

export const useLinkMySession = () => {
  const queryClient = useQueryClient();
  return useMutation<WhatsappLinkArtifacts, unknown, { sessionId: string; phoneNumber: string }>({
    mutationFn: ({ sessionId, phoneNumber }) => cashierService.linkMySession(sessionId, phoneNumber),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashierKeys.mySessions });
    },
  });
};

export const useRefreshMySession = () => {
  const queryClient = useQueryClient();
  return useMutation<WhatsappLinkArtifacts, unknown, string>({
    mutationFn: (sessionId: string) => cashierService.refreshMySession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashierKeys.mySessions });
    },
  });
};

export const useResetMySessionRefresh = () => {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (sessionId: string) => cashierService.resetMySessionRefresh(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashierKeys.mySessions });
    },
  });
};

export const useMySessionStatus = (sessionId: string, enabled = true) =>
  useQuery<WhatsappSessionStatus>({
    queryKey: cashierKeys.mySessionStatus(sessionId),
    queryFn: () => cashierService.getMySessionStatus(sessionId),
    enabled: enabled && Boolean(sessionId),
    refetchInterval: enabled ? 5_000 : false,
  });
