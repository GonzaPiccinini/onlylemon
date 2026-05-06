import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cashierService } from "@/api/cashier.service";
import { env } from "@/config/env";
import type { CashierRuntimeState, ConvertLeadInput, LeadStatus } from "@/types/domain";

const cashierKeys = {
  sessions: ["cashier", "sessions"] as const,
  currentSession: ["cashier", "current-session"] as const,
  runtimeState: ["cashier", "runtime-state"] as const,
  leads: (status?: LeadStatus) => ["cashier", "leads", status ?? "ALL"] as const,
  searchLeads: (q: string) => ["cashier", "leads", "search", q] as const,
  conversions: (page: number, pageSize: number) => ["cashier", "conversions", page, pageSize] as const,
  whatsappLinkState: ["cashier", "whatsapp-link-state"] as const,
  whatsappLinkStatus: ["cashier", "whatsapp-link-status"] as const,
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
    refetchInterval: 5_000,
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

        const sessionChanged = previous?.sessionName !== payload.sessionName;
        if (sessionChanged) {
          void queryClient.invalidateQueries({ queryKey: cashierKeys.whatsappLinkState });
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

/** @deprecated Use useCreateConversion instead — remove in M6 */
export const useConvertQueueLead = useCreateConversion;

export const useSearchCashierLeads = (q: string, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: cashierKeys.searchLeads(q),
    queryFn: () => cashierService.searchLeads(q),
    enabled: q.length > 0 && (options?.enabled ?? true),
  });

export const useCashierConversions = ({ page, pageSize }: { page: number; pageSize: number }) =>
  useQuery({
    queryKey: cashierKeys.conversions(page, pageSize),
    queryFn: () => cashierService.listConversions({ page, pageSize }),
  });

export const useCashierLeads = (status?: LeadStatus) =>
  useQuery({
    queryKey: cashierKeys.leads(status),
    queryFn: () => cashierService.listLeads(status),
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
