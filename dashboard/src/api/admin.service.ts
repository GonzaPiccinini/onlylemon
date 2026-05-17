import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import type {
  AdminFundsSeries,
  AdminListItem,
  AdminStatus,
  Cashier,
  CashierStats,
  Conversion,
  ConversionsFilters,
  ConversionsTotals,
  CreateAdminInput,
  CreateLandingFallbackPhoneInput,
  CreateLandingInput,
  CreateCashierInput,
  DateRangeFilters,
  Landing,
  LandingFallbackPhone,
  Lead,
  LeadHistoryPage,
  LeadsFilters,
  PaginatedResult,
  ReplaceSessionLandingsInput,
  StatsSummary,
  UpdateAdminAccountInput,
  UpdateAdminInput,
  UpdateCashierMaxSessionsInput,
  UpdateLandingFallbackPhoneInput,
  UpdateLandingInput,
  UpdateCashierInput,
  WhatsappLinkArtifacts,
  WhatsappSession,
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

  async enableCashier(cashierId: string): Promise<void> {
    await http.patch(endpoints.admin.cashierEnable(cashierId));
  },

  async finishCashierWorkSession(cashierId: string): Promise<void> {
    await http.post(endpoints.admin.cashierFinishSession(cashierId));
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

  async getFundsSeries(filters: DateRangeFilters): Promise<AdminFundsSeries> {
    const { data } = await http.get<AdminFundsSeries>(
      endpoints.admin.statsFundsSeries,
      {
        params: toDateRangeParams(filters),
      },
    );
    return data;
  },

  async listLeads(filters: LeadsFilters): Promise<Lead[]> {
    const { data } = await http.get<Lead[]>(endpoints.admin.leads, {
      params: {
        ...(filters.statuses?.length ? { statuses: filters.statuses } : {}),
        ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
        ...(filters.cashierIds?.length ? { cashierIds: filters.cashierIds } : {}),
        ...(filters.adCode ? { adCode: filters.adCode } : {}),
        ...(filters.code ? { code: filters.code } : {}),
        ...(filters.phone ? { phone: filters.phone } : {}),
      },
    });

    return data;
  },

  async getLeadHistory(
    leadId: string,
    opts: { page: number; pageSize?: number; dateFrom?: string; dateTo?: string },
  ): Promise<LeadHistoryPage> {
    const { data } = await http.get<LeadHistoryPage>(
      endpoints.admin.leadHistory(leadId),
      {
        params: {
          page: opts.page,
          ...(opts.pageSize !== undefined ? { pageSize: opts.pageSize } : {}),
          ...(opts.dateFrom ? { dateFrom: opts.dateFrom } : {}),
          ...(opts.dateTo ? { dateTo: opts.dateTo } : {}),
        },
      },
    );
    return data;
  },

  async listConversions(filters: ConversionsFilters): Promise<PaginatedResult<Conversion>> {
    const { data } = await http.get<PaginatedResult<Conversion>>(endpoints.admin.conversions, {
      params: {
        ...(filters.page !== undefined ? { page: filters.page } : {}),
        ...(filters.pageSize !== undefined ? { pageSize: filters.pageSize } : {}),
        ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
        ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
        ...(filters.phone ? { phone: filters.phone } : {}),
        ...(filters.code ? { code: filters.code } : {}),
        ...(filters.adCode ? { adCode: filters.adCode } : {}),
        ...(filters.cashierIds?.length ? { cashierIds: filters.cashierIds.join(",") } : {}),
        ...(filters.amountMin !== undefined ? { amountMin: filters.amountMin } : {}),
        ...(filters.amountMax !== undefined ? { amountMax: filters.amountMax } : {}),
      },
    });
    return data;
  },

  async getConversionsTotals(
    filters: Omit<ConversionsFilters, "page" | "pageSize">,
  ): Promise<ConversionsTotals> {
    const { data } = await http.get<ConversionsTotals>(endpoints.admin.conversionsTotals, {
      params: {
        ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
        ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
        ...(filters.phone ? { phone: filters.phone } : {}),
        ...(filters.code ? { code: filters.code } : {}),
        ...(filters.adCode ? { adCode: filters.adCode } : {}),
        ...(filters.cashierIds?.length ? { cashierIds: filters.cashierIds.join(",") } : {}),
        ...(filters.amountMin !== undefined ? { amountMin: filters.amountMin } : {}),
        ...(filters.amountMax !== undefined ? { amountMax: filters.amountMax } : {}),
      },
    });
    return data;
  },

  async updateAdminAccount(input: UpdateAdminAccountInput): Promise<void> {
    await http.patch(endpoints.admin.account, input);
  },

  async listAdmins(): Promise<AdminListItem[]> {
    const { data } = await http.get<AdminListItem[]>(endpoints.admin.admins);
    return data;
  },

  async createAdmin(input: CreateAdminInput): Promise<AdminListItem> {
    const { data } = await http.post<AdminListItem>(endpoints.admin.admins, input);
    return data;
  },

  async updateAdmin(adminId: string, input: UpdateAdminInput): Promise<AdminListItem> {
    const { data } = await http.patch<AdminListItem>(endpoints.admin.adminById(adminId), input);
    return data;
  },

  async setAdminStatus(adminId: string, status: AdminStatus): Promise<AdminListItem> {
    const { data } = await http.patch<AdminListItem>(endpoints.admin.adminStatus(adminId), { status });
    return data;
  },

  async listLandingFallbackPhones(landingId: string): Promise<LandingFallbackPhone[]> {
    const { data } = await http.get<LandingFallbackPhone[]>(
      endpoints.admin.landingFallbackPhones(landingId),
    );
    return data;
  },

  async createLandingFallbackPhone(
    landingId: string,
    input: CreateLandingFallbackPhoneInput,
  ): Promise<LandingFallbackPhone> {
    const { data } = await http.post<LandingFallbackPhone>(
      endpoints.admin.landingFallbackPhones(landingId),
      input,
    );
    return data;
  },

  async updateLandingFallbackPhone(
    landingId: string,
    id: string,
    patch: UpdateLandingFallbackPhoneInput,
  ): Promise<LandingFallbackPhone> {
    const { data } = await http.patch<LandingFallbackPhone>(
      endpoints.admin.landingFallbackPhone(landingId, id),
      patch,
    );
    return data;
  },

  async deleteLandingFallbackPhone(landingId: string, id: string): Promise<void> {
    await http.delete(endpoints.admin.landingFallbackPhone(landingId, id));
  },

  // ---------------------------------------------------------------------------
  // E — WhatsappSession admin API
  // ---------------------------------------------------------------------------

  async listCashierSessions(cashierId: string): Promise<WhatsappSession[]> {
    const { data } = await http.get<WhatsappSession[]>(endpoints.admin.cashierWhatsappSessions(cashierId));
    return data;
  },

  async createCashierSession(cashierId: string): Promise<WhatsappSession> {
    const { data } = await http.post<WhatsappSession>(endpoints.admin.cashierWhatsappSessions(cashierId));
    return data;
  },

  async deleteCashierSession(sessionId: string): Promise<void> {
    await http.delete(endpoints.admin.whatsappSession(sessionId));
  },

  async getSessionLandings(sessionId: string): Promise<Landing[]> {
    const { data } = await http.get<Landing[]>(endpoints.admin.whatsappSessionLandings(sessionId));
    return data;
  },

  async replaceSessionLandings(sessionId: string, input: ReplaceSessionLandingsInput): Promise<Landing[]> {
    const { data } = await http.put<Landing[]>(endpoints.admin.whatsappSessionLandings(sessionId), input);
    return data;
  },

  async getLandingSessions(landingId: string): Promise<WhatsappSession[]> {
    const { data } = await http.get<WhatsappSession[]>(endpoints.admin.landingSessions(landingId));
    return data;
  },

  async updateCashierMaxSessions(cashierId: string, input: UpdateCashierMaxSessionsInput): Promise<Cashier> {
    const { data } = await http.patch<Cashier>(endpoints.admin.cashierById(cashierId), input);
    return data;
  },

  async linkCashierSession(sessionId: string, phoneNumber: string): Promise<WhatsappLinkArtifacts> {
    const { data } = await http.post<WhatsappLinkArtifacts>(
      endpoints.admin.linkCashierSession(sessionId),
      { phoneNumber },
    );
    return data;
  },
};
