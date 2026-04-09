import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cashierService } from "@/api/cashier.service";
import type { AddFundsInput } from "@/types/domain";

const cashierKeys = {
  sessions: ["cashier", "sessions"] as const,
  currentSession: ["cashier", "current-session"] as const,
  clientPhones: ["cashier", "client-phones"] as const,
  addFundsHistory: ["cashier", "add-funds-history"] as const,
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

export const useClientPhones = () =>
  useQuery({
    queryKey: cashierKeys.clientPhones,
    queryFn: cashierService.listClientPhones,
  });

export const useAddFundsHistory = () =>
  useQuery({
    queryKey: cashierKeys.addFundsHistory,
    queryFn: cashierService.listAddFundsHistory,
  });

export const useAddFunds = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddFundsInput) => cashierService.addFunds(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashierKeys.addFundsHistory });
    },
  });
};

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
