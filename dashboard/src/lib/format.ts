import { ARGENTINA_TZ } from "./timezone";

/** Groups a number with es-AR separators and no decimals, e.g. 12345 → "12.345". */
export const formatAmount = (amount: number): string =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(amount);

/**
 * Formats an amount with an explicit currency symbol, e.g. ("$", 12345) → "$ 12.345".
 * Use this with the active platform currency symbol (see useMoneyFormatter).
 */
export const formatCurrencyWith = (amount: number, symbol: string): string =>
  `${symbol} ${formatAmount(amount)}`;

/** Legacy ARS-only formatter. Prefer useMoneyFormatter() so the symbol follows the selected currency. */
export const formatCurrency = (amount: number): string =>
  formatCurrencyWith(amount, "$");

export const formatPercentage = (value: number): string =>
  `${value.toFixed(1)}%`;

export const formatDateTime = (value: string): string => {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ARGENTINA_TZ,
  }).format(date);
  const timePart = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ARGENTINA_TZ,
  }).format(date);
  return `${datePart}, ${timePart}`;
};

export const formatHours = (value: number): string => `${value.toFixed(2)} h`;
