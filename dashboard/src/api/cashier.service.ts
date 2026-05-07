import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import type {
  CashierRuntimeState,
  Conversion,
  ConvertLeadInput,
  Lead,
  LeadStatus,
  PaginatedResult,
  Session,
  UpdateCashierAccountInput,
  WhatsappLinkArtifacts,
  WhatsappLinkState,
  WhatsappLinkStatus,
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

  async listConversions({ page, pageSize }: { page: number; pageSize: number }): Promise<PaginatedResult<Conversion>> {
    const { data } = await http.get<PaginatedResult<Conversion>>(endpoints.cashier.conversions, {
      params: { page, pageSize },
    });
    return data;
  },

  async listLeads(status?: LeadStatus): Promise<Lead[]> {
    const { data } = await http.get<Lead[]>(endpoints.cashier.leads, {
      params: status ? { status } : undefined,
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
};
