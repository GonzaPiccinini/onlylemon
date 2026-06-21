import { endpoints } from "@/api/endpoints";
import { http } from "@/api/http";
import type { ActiveCurrency } from "@/types/domain";

/**
 * Settings readable by any authenticated user (admins and cashiers).
 * Backed by GET /api/settings/currency.
 */
export const settingsService = {
  async getActiveCurrency(): Promise<ActiveCurrency> {
    const { data } = await http.get<ActiveCurrency>(endpoints.settings.activeCurrency);
    return data;
  },
};
