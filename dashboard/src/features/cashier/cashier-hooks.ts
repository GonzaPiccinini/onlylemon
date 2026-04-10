import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cashierService } from "@/api/cashier.service";
import type { ConvertLeadInput, LeadStatus } from "@/types/domain";

const cashierKeys = {
  sessions: ["cashier", "sessions"] as const,
  currentSession: ["cashier", "current-session"] as const,
  queueCurrentLead: ["cashier", "queue-current-lead"] as const,
  leads: (status?: LeadStatus) => ["cashier", "leads", status ?? "ALL"] as const,
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
      ]);
    },
  });
};

export const useQueueCurrentLead = () =>
  useQuery({
    queryKey: cashierKeys.queueCurrentLead,
    queryFn: cashierService.getQueueCurrentLead,
  });

export const useConvertQueueLead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, input }: { leadId: string; input: ConvertLeadInput }) =>
      cashierService.convertQueueLead(leadId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cashierKeys.queueCurrentLead }),
        queryClient.invalidateQueries({ queryKey: ["cashier", "leads"] }),
      ]);
    },
  });
};

export const useSkipQueueLead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => cashierService.skipQueueLead(leadId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashierKeys.queueCurrentLead });
    },
  });
};

export const useCashierLeads = (status?: LeadStatus) =>
  useQuery({
    queryKey: cashierKeys.leads(status),
    queryFn: () => cashierService.listLeads(status),
  });

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
