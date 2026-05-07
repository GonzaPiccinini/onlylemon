const ARGENTINA_UTC_OFFSET_HOURS = -3;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const argentinaDayStartUtc = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  const offsetMs = ARGENTINA_UTC_OFFSET_HOURS * MS_PER_HOUR;
  return new Date(Date.UTC(year, month - 1, day) - offsetMs);
};

export const argentinaDayEndUtcExclusive = (dateString: string): Date => {
  return new Date(argentinaDayStartUtc(dateString).getTime() + MS_PER_DAY);
};

export const formatArgentinaDayKey = (date: Date): string => {
  const offsetMs = ARGENTINA_UTC_OFFSET_HOURS * MS_PER_HOUR;
  const shifted = new Date(date.getTime() + offsetMs);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Adds one calendar day to a YYYY-MM-DD string.
 * Uses UTC arithmetic to avoid DST ambiguities.
 * Example: '2026-05-07' → '2026-05-08', '2026-05-31' → '2026-06-01'.
 */
export const addOneDayIsoDate = (yyyyMmDd: string): string => {
  const [year, month, day] = yyyyMmDd.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const y = nextDay.getUTCFullYear();
  const m = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nextDay.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
