import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import type {
  CashierConversionsFilters,
  CashierRuntimeState,
  Conversion,
  ConvertLeadInput,
  Lead,
  MyWhatsappSession,
  PaginatedResult,
  Session,
  UpdateCashierAccountInput,
  WhatsappLinkArtifacts,
  WhatsappLinkState,
  WhatsappLinkStatus,
  WhatsappSessionStatus,
} from "@/types/domain";

export const cashierService = {
  async listSessions(): Promise<Session[]> {
    const { data } = await http.get<Session[]>(endpoints.cashier.sessions);
    return data;
  },

  async getCurrentSession(): Promise<Session | null> {
    const { data } = await http.get<Session | null>(endpoints.cashier.currentSession);
    return data;
  },

  async startSession(): Promise<Session> {
    const { data } = await http.post<Session>(endpoints.cashier.sessionStart);
    return data;
  },

  async finishSession(): Promise<Session> {
    const { data } = await http.post<Session>(endpoints.cashier.sessionFinish);
    return data;
  },

  async createConversion(leadId: string, input: ConvertLeadInput): Promise<{ conversion: Conversion }> {
    const { data } = await http.post<{ conversion: Conversion }>(
      endpoints.cashier.createConversion(leadId),
      input,
    );
    return data;
  },

  async searchLeads(q: string): Promise<Lead[]> {
    const { data } = await http.get<{ items: Lead[] }>(endpoints.cashier.searchLeads, {
      params: { q },
    });
    return data.items;
  },

  async listConversions(filters: CashierConversionsFilters): Promise<PaginatedResult<Conversion>> {
    const { data } = await http.get<PaginatedResult<Conversion>>(endpoints.cashier.conversions, {
      params: {
        ...(filters.page !== undefined ? { page: filters.page } : {}),
        ...(filters.pageSize !== undefined ? { pageSize: filters.pageSize } : {}),
        ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
        ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
        ...(filters.phone ? { phone: filters.phone } : {}),
        ...(filters.code ? { code: filters.code } : {}),
        ...(filters.amountMin !== undefined ? { amountMin: filters.amountMin } : {}),
        ...(filters.amountMax !== undefined ? { amountMax: filters.amountMax } : {}),
      },
    });
    return data;
  },

  async getRuntimeState(): Promise<CashierRuntimeState> {
    const { data } = await http.get<CashierRuntimeState>(endpoints.cashier.runtimeState);
    return data;
  },

  async updateAccount(input: UpdateCashierAccountInput): Promise<void> {
    await http.patch(endpoints.cashier.account, input);
  },

  async getWhatsappLinkState(): Promise<WhatsappLinkState> {
    const { data } = await http.get<WhatsappLinkState>(endpoints.cashier.whatsappLinkState);
    return data;
  },

  async startWhatsappLink(phoneNumber: string): Promise<WhatsappLinkArtifacts> {
    const { data } = await http.post<WhatsappLinkArtifacts>(endpoints.cashier.whatsappLinkStart, {
      phoneNumber,
    });
    return data;
  },

  async refreshWhatsappLink(): Promise<WhatsappLinkArtifacts> {
    const { data } = await http.post<WhatsappLinkArtifacts>(endpoints.cashier.whatsappLinkRefresh);
    return data;
  },

  async resetWhatsappLink(): Promise<void> {
    await http.post(endpoints.cashier.whatsappLinkReset);
  },

  async getWhatsappLinkStatus(): Promise<WhatsappLinkStatus> {
    const { data } = await http.get<WhatsappLinkStatus>(endpoints.cashier.whatsappLinkStatus);
    return data;
  },

  async completeWhatsappLink(sessionName: string): Promise<WhatsappLinkStatus> {
    const { data } = await http.post<WhatsappLinkStatus>(endpoints.cashier.whatsappLinkComplete, {
      sessionName,
    });
    return data;
  },

  // Batch 5 — per-session cashier endpoints
  async listMySessions(): Promise<MyWhatsappSession[]> {
    const { data } = await http.get<MyWhatsappSession[]>(endpoints.cashier.mySessions);
    return data;
  },

  async createMySession(): Promise<MyWhatsappSession> {
    const { data } = await http.post<MyWhatsappSession>(endpoints.cashier.mySessions);
    return data;
  },

  async deleteMySession(sessionId: string): Promise<void> {
    await http.delete(endpoints.cashier.mySession(sessionId));
  },

  async linkMySession(sessionId: string, phoneNumber: string): Promise<WhatsappLinkArtifacts> {
    const { data } = await http.post<WhatsappLinkArtifacts>(endpoints.cashier.mySessionLink(sessionId), {
      phoneNumber,
    });
    return data;
  },

  async refreshMySession(sessionId: string): Promise<WhatsappLinkArtifacts> {
    const { data } = await http.post<WhatsappLinkArtifacts>(endpoints.cashier.mySessionRefresh(sessionId));
    return data;
  },

  async resetMySessionRefresh(sessionId: string): Promise<void> {
    await http.post(endpoints.cashier.mySessionResetRefresh(sessionId));
  },

  async getMySessionStatus(sessionId: string): Promise<WhatsappSessionStatus> {
    const { data } = await http.get<WhatsappSessionStatus>(endpoints.cashier.mySessionStatus(sessionId));
    return data;
  },
};
