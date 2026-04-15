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
