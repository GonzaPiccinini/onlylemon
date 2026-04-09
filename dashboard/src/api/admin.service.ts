import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import type {
  Cashier,
  CashierStats,
  CreateLandingInput,
  CreateCashierInput,
  DateRangeFilters,
  FundsSeriesPoint,
  Landing,
  StatsSummary,
  UpdateLandingInput,
  UpdateCashierInput,
} from "@/types/domain";

const toDateRangeParams = (filters: DateRangeFilters) => ({
  from: filters.from,
  to: filters.to,
  ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
});

export const adminService = {
  async listCashiers(): Promise<Cashier[]> {
    const { data } = await http.get<Cashier[]>(endpoints.admin.cashiers);
    return data;
  },

  async createCashier(input: CreateCashierInput): Promise<Cashier> {
    const { data } = await http.post<Cashier>(endpoints.admin.cashiers, input);
    return data;
  },

  async updateCashier(cashierId: string, input: UpdateCashierInput): Promise<Cashier> {
    const { data } = await http.put<Cashier>(
      endpoints.admin.cashierById(cashierId),
      input,
    );
    return data;
  },

  async disableCashier(cashierId: string): Promise<void> {
    await http.patch(endpoints.admin.cashierDisable(cashierId));
  },

  async replaceCashierLandings(cashierId: string, landingIds: string[]): Promise<Landing[]> {
    const { data } = await http.put<Landing[]>(endpoints.admin.cashierLandings(cashierId), {
      landingIds,
    });
    return data;
  },

  async listLandings(): Promise<Landing[]> {
    const { data } = await http.get<Landing[]>(endpoints.admin.landings);
    return data;
  },

  async createLanding(input: CreateLandingInput): Promise<Landing> {
    const { data } = await http.post<Landing>(endpoints.admin.landings, input);
    return data;
  },

  async updateLanding(landingId: string, input: UpdateLandingInput): Promise<Landing> {
    const { data } = await http.put<Landing>(endpoints.admin.landingById(landingId), input);
    return data;
  },

  async disableLanding(landingId: string): Promise<Landing> {
    const { data } = await http.patch<Landing>(endpoints.admin.landingDisable(landingId));
    return data;
  },

  async enableLanding(landingId: string): Promise<Landing> {
    const { data } = await http.patch<Landing>(endpoints.admin.landingEnable(landingId));
    return data;
  },

  async getSummary(filters: DateRangeFilters): Promise<StatsSummary> {
    const { data } = await http.get<StatsSummary>(endpoints.admin.statsSummary, {
      params: toDateRangeParams(filters),
    });
    return data;
  },

  async getCashierStats(filters: DateRangeFilters): Promise<CashierStats[]> {
    const { data } = await http.get<CashierStats[]>(endpoints.admin.statsByCashier, {
      params: toDateRangeParams(filters),
    });
    return data;
  },

  async getFundsSeries(filters: DateRangeFilters): Promise<FundsSeriesPoint[]> {
    const { data } = await http.get<FundsSeriesPoint[]>(
      endpoints.admin.statsFundsSeries,
      {
        params: toDateRangeParams(filters),
      },
    );
    return data;
  },
};
