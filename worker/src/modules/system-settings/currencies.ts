/**
 * system-settings/currencies.ts
 *
 * Single source of truth for the currencies the platform supports.
 *
 * The platform-wide currency (SETTING_KEYS.PLATFORM_CURRENCY) must always be
 * one of these ISO 4217 codes — the controller validates against this list and
 * the dashboard renders the selector from the GET /currency-options endpoint,
 * so adding a new currency only requires editing THIS array.
 *
 * `symbol` is what the dashboard renders next to amounts for the active currency
 * (exposed via GET /api/settings/currency to any authenticated user).
 */

export interface SupportedCurrency {
  /** ISO 4217 code, e.g. "ARS". This is exactly what is sent to Meta. */
  code: string;
  /** Human label shown in the admin selector. */
  label: string;
  /** Symbol rendered next to amounts in the dashboard, e.g. "$", "R$", "₲". */
  symbol: string;
}

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = [
  { code: 'ARS', label: 'Peso argentino (ARS)', symbol: '$' },
  { code: 'BRL', label: 'Real brasileño (BRL)', symbol: 'R$' },
  { code: 'MXN', label: 'Peso mexicano (MXN)', symbol: '$' },
  { code: 'CLP', label: 'Peso chileno (CLP)', symbol: '$' },
  { code: 'COP', label: 'Peso colombiano (COP)', symbol: '$' },
  { code: 'PYG', label: 'Guaraní paraguayo (PYG)', symbol: '₲' },
];

/** Default used when the setting is unset or holds an unsupported value. */
export const DEFAULT_CURRENCY = 'ARS';

export const SUPPORTED_CURRENCY_CODES: readonly string[] =
  SUPPORTED_CURRENCIES.map((c) => c.code);

export const isSupportedCurrency = (code: string): boolean =>
  SUPPORTED_CURRENCY_CODES.includes(code);

/**
 * Returns the full currency descriptor for `code`, falling back to the default
 * currency (ARS) when the code is unset or unsupported. Never returns undefined.
 */
export const getCurrencyMeta = (code: string): SupportedCurrency => {
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  if (found) return found;
  return SUPPORTED_CURRENCIES.find((c) => c.code === DEFAULT_CURRENCY)!;
};
