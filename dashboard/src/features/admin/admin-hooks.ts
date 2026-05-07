import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/api/admin.service";
import type {
  ConversionsFilters,
  CreateCashierInput,
  CreateLandingInput,
  DateRangeFilters,
  LeadsFilters,
  UpdateAdminAccountInput,
  UpdateCashierInput,
  UpdateLandingInput,
} from "@/types/domain";

const adminKeys = {
  cashiers: ["admin", "cashiers"] as const,
  landings: ["admin", "landings"] as const,
  summary: (filters: DateRangeFilters) => ["admin", "summary", filters] as const,
  cashierStats: (filters: DateRangeFilters) => ["admin", "cashier-stats", filters] as const,
  fundsSeries: (filters: DateRangeFilters) => ["admin", "funds-series", filters] as const,
  leads: (filters: LeadsFilters) => ["admin", "leads", filters] as const,
  conversions: (filters: ConversionsFilters) => ["admin", "conversions", filters] as const,
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

export const useAdminConversions = (filters: ConversionsFilters) =>
  useQuery({
    queryKey: adminKeys.conversions(filters),
    queryFn: () => adminService.listConversions(filters),
  });

export const useUpdateAdminAccount = () =>
  useMutation({
    mutationFn: (input: UpdateAdminAccountInput) =>
      adminService.updateAdminAccount(input),
  });
