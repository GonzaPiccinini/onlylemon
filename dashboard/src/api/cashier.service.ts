import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import type {
  AddFunds,
  AddFundsInput,
  ClientPhoneOption,
  Session,
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

  async listClientPhones(): Promise<ClientPhoneOption[]> {
    const { data } = await http.get<ClientPhoneOption[]>(endpoints.cashier.clientPhones);
    return data;
  },

  async addFunds(input: AddFundsInput): Promise<AddFunds> {
    const { data } = await http.post<AddFunds>(endpoints.cashier.addFunds, input);
    return data;
  },

  async listAddFundsHistory(): Promise<AddFunds[]> {
    const { data } = await http.get<AddFunds[]>(endpoints.cashier.addFundsHistory);
    return data;
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
