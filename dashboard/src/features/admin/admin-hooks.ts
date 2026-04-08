import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/api/admin.service";
import type { CreateCashierInput, DateRangeFilters, UpdateCashierInput } from "@/types/domain";

const adminKeys = {
  cashiers: ["admin", "cashiers"] as const,
  summary: (filters: DateRangeFilters) => ["admin", "summary", filters] as const,
  cashierStats: (filters: DateRangeFilters) => ["admin", "cashier-stats", filters] as const,
  fundsSeries: (filters: DateRangeFilters) => ["admin", "funds-series", filters] as const,
};

export const useAdminCashiers = () =>
  useQuery({
    queryKey: adminKeys.cashiers,
    queryFn: adminService.listCashiers,
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
