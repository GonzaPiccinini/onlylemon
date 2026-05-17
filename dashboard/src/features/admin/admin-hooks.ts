import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/api/admin.service";
import type {
  ConversionsFilters,
  CreateCashierInput,
  CreateLandingFallbackPhoneInput,
  CreateLandingInput,
  DateRangeFilters,
  LeadsFilters,
  ReplaceSessionLandingsInput,
  UpdateAdminAccountInput,
  UpdateCashierInput,
  UpdateCashierMaxSessionsInput,
  UpdateLandingFallbackPhoneInput,
  UpdateLandingInput,
} from "@/types/domain";

type ConversionsTotalsFilters = Omit<ConversionsFilters, "page" | "pageSize">;

export const adminKeys = {
  cashiers: ["admin", "cashiers"] as const,
  cashierSessions: (cashierId: string) => ["admin", "cashiers", cashierId, "sessions"] as const,
  sessionLandings: (sessionId: string) => ["admin", "sessions", sessionId, "landings"] as const,
  landingSessions: (landingId: string) => ["admin", "landings", landingId, "sessions"] as const,
  landings: ["admin", "landings"] as const,
  landingFallbackPhones: (landingId: string) =>
    ["admin", "landings", landingId, "fallback-phones"] as const,
  summary: (filters: DateRangeFilters) => ["admin", "summary", filters] as const,
  cashierStats: (filters: DateRangeFilters) => ["admin", "cashier-stats", filters] as const,
  fundsSeries: (filters: DateRangeFilters) => ["admin", "funds-series", filters] as const,
  leads: (filters: LeadsFilters) => ["admin", "leads", filters] as const,
  leadHistory: (leadId: string, filters: { dateFrom?: string | null; dateTo?: string | null }) =>
    ["admin", "lead-history", leadId, filters] as const,
  conversions: (filters: ConversionsFilters) => ["admin", "conversions", filters] as const,
  conversionsTotals: (filters: ConversionsTotalsFilters) =>
    ["admin", "conversions-totals", filters] as const,
};

export const useAdminCashiers = () =>
  useQuery({
    queryKey: adminKeys.cashiers,
    queryFn: adminService.listCashiers,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

export const useCreateCashier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCashierInput) => adminService.createCashier(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useReplaceCashierLandings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cashierId, landingIds }: { cashierId: string; landingIds: string[] }) =>
      adminService.replaceCashierLandings(cashierId, landingIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.cashiers }),
        queryClient.invalidateQueries({ queryKey: adminKeys.landings }),
      ]);
    },
  });
};

export const useUpdateCashier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cashierId, input }: { cashierId: string; input: UpdateCashierInput }) =>
      adminService.updateCashier(cashierId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useDisableCashier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cashierId: string) => adminService.disableCashier(cashierId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useEnableCashier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cashierId: string) => adminService.enableCashier(cashierId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useFinishCashierWorkSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cashierId: string) =>
      adminService.finishCashierWorkSession(cashierId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useLandings = () =>
  useQuery({
    queryKey: adminKeys.landings,
    queryFn: adminService.listLandings,
  });

export const useCreateLanding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLandingInput) => adminService.createLanding(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.landings });
    },
  });
};

export const useUpdateLanding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ landingId, input }: { landingId: string; input: UpdateLandingInput }) =>
      adminService.updateLanding(landingId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.landings });
    },
  });
};

export const useSetLandingStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ landingId, enabled }: { landingId: string; enabled: boolean }) =>
      enabled ? adminService.enableLanding(landingId) : adminService.disableLanding(landingId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.landings }),
        queryClient.invalidateQueries({ queryKey: adminKeys.cashiers }),
      ]);
    },
  });
};

export const useAdminSummary = (filters: DateRangeFilters) =>
  useQuery({
    queryKey: adminKeys.summary(filters),
    queryFn: () => adminService.getSummary(filters),
  });

export const useCashierStats = (filters: DateRangeFilters) =>
  useQuery({
    queryKey: adminKeys.cashierStats(filters),
    queryFn: () => adminService.getCashierStats(filters),
  });

export const useFundsSeries = (filters: DateRangeFilters) =>
  useQuery({
    queryKey: adminKeys.fundsSeries(filters),
    queryFn: () => adminService.getFundsSeries(filters),
  });

export const useAdminLeads = (filters: LeadsFilters) =>
  useQuery({
    queryKey: adminKeys.leads(filters),
    queryFn: () => adminService.listLeads(filters),
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

export const useAdminLeadHistory = (
  leadId: string,
  opts: { enabled: boolean; dateFrom?: string; dateTo?: string },
) =>
  useInfiniteQuery({
    queryKey: adminKeys.leadHistory(leadId, {
      dateFrom: opts.dateFrom ?? null,
      dateTo: opts.dateTo ?? null,
    }),
    queryFn: ({ pageParam }) =>
      adminService.getLeadHistory(leadId, {
        page: pageParam as number,
        pageSize: 10,
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: opts.enabled,
    staleTime: 30_000,
  });

export const useAdminConversions = (filters: ConversionsFilters) =>
  useQuery({
    queryKey: adminKeys.conversions(filters),
    queryFn: () => adminService.listConversions(filters),
  });

export const useAdminConversionsTotals = (filters: ConversionsTotalsFilters) =>
  useQuery({
    queryKey: adminKeys.conversionsTotals(filters),
    queryFn: () => adminService.getConversionsTotals(filters),
  });

export const useUpdateAdminAccount = () =>
  useMutation({
    mutationFn: (input: UpdateAdminAccountInput) =>
      adminService.updateAdminAccount(input),
  });

export const useLandingFallbackPhones = (landingId: string) =>
  useQuery({
    queryKey: adminKeys.landingFallbackPhones(landingId),
    queryFn: () => adminService.listLandingFallbackPhones(landingId),
  });

export const useCreateLandingFallbackPhone = (landingId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLandingFallbackPhoneInput) =>
      adminService.createLandingFallbackPhone(landingId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.landingFallbackPhones(landingId),
        }),
        queryClient.invalidateQueries({ queryKey: adminKeys.landings }),
      ]);
    },
  });
};

export const useUpdateLandingFallbackPhone = (landingId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateLandingFallbackPhoneInput }) =>
      adminService.updateLandingFallbackPhone(landingId, id, patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.landingFallbackPhones(landingId),
        }),
        queryClient.invalidateQueries({ queryKey: adminKeys.landings }),
      ]);
    },
  });
};

export const useDeleteLandingFallbackPhone = (landingId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminService.deleteLandingFallbackPhone(landingId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.landingFallbackPhones(landingId),
        }),
        queryClient.invalidateQueries({ queryKey: adminKeys.landings }),
      ]);
    },
    // Surface LAST_FALLBACK 409 through the mutation error — UI reads mutation.error
    // No special transform needed: the raw ApiError shape (statusCode + message/error code)
    // is surfaced automatically via the mutation's `error` field.
  });
};

// ---------------------------------------------------------------------------
// E/F — WhatsappSession admin hooks
// ---------------------------------------------------------------------------

export const useCashierSessions = (cashierId: string) =>
  useQuery({
    queryKey: adminKeys.cashierSessions(cashierId),
    queryFn: () => adminService.listCashierSessions(cashierId),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

export const useCreateCashierSession = (cashierId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminService.createCashierSession(cashierId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashierSessions(cashierId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useDeleteCashierSession = (cashierId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => adminService.deleteCashierSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashierSessions(cashierId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useSessionLandings = (sessionId: string) =>
  useQuery({
    queryKey: adminKeys.sessionLandings(sessionId),
    queryFn: () => adminService.getSessionLandings(sessionId),
  });

export const useReplaceSessionLandings = (sessionId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplaceSessionLandingsInput) =>
      adminService.replaceSessionLandings(sessionId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.sessionLandings(sessionId) }),
        queryClient.invalidateQueries({ queryKey: adminKeys.landings }),
        queryClient.invalidateQueries({ queryKey: adminKeys.cashiers }),
      ]);
    },
  });
};

export const useLandingSessions = (landingId: string) =>
  useQuery({
    queryKey: adminKeys.landingSessions(landingId),
    queryFn: () => adminService.getLandingSessions(landingId),
  });

export const useUpdateCashierMaxSessions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cashierId, input }: { cashierId: string; input: UpdateCashierMaxSessionsInput }) =>
      adminService.updateCashierMaxSessions(cashierId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashiers });
    },
  });
};

export const useLinkAdminCashierSession = (cashierId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, phoneNumber }: { sessionId: string; phoneNumber: string }) =>
      adminService.linkCashierSession(sessionId, phoneNumber),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.cashierSessions(cashierId) });
    },
  });
};
