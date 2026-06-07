import { useQuery } from "@tanstack/react-query";
import { settingsService } from "@/api/settings.service";
import { formatAmount, formatCurrencyWith } from "@/lib/format";
import type { ActiveCurrency } from "@/types/domain";

export const activeCurrencyKey = ["settings", "active-currency"] as const;

/** Sensible default so amounts render before the request resolves / on error. */
const DEFAULT_ACTIVE_CURRENCY: ActiveCurrency = {
  code: "ARS",
  label: "Peso argentino (ARS)",
  symbol: "$",
};

/**
 * The platform's active currency (code + label + symbol). Readable by any
 * authenticated user, so it works on both admin and cashier pages.
 */
export const useActiveCurrency = (): ActiveCurrency => {
  const { data } = useQuery({
    queryKey: activeCurrencyKey,
    queryFn: () => settingsService.getActiveCurrency(),
    staleTime: 60_000,
  });
  return data ?? DEFAULT_ACTIVE_CURRENCY;
};

export interface MoneyFormatter {
  /** Active currency symbol, e.g. "$", "R$", "₲". */
  symbol: string;
  /** Active ISO 4217 code, e.g. "ARS". */
  code: string;
  /** Formats an amount with the active symbol, e.g. "₲ 12.345". */
  format: (amount: number) => string;
  /** Formats just the grouped number without a symbol, e.g. "12.345". */
  formatAmount: (amount: number) => string;
}

/**
 * Returns helpers to render money with the active currency symbol. Use
 * `format(amount)` wherever amounts are shown so the symbol follows the
 * currency selected in admin settings.
 */
export const useMoneyFormatter = (): MoneyFormatter => {
  const { symbol, code } = useActiveCurrency();
  return {
    symbol,
    code,
    format: (amount: number) => formatCurrencyWith(amount, symbol),
    formatAmount,
  };
};
