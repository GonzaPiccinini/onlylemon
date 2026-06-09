/**
 * time.ts — Chat timestamp helpers.
 *
 * Message timestamps reach the UI in MIXED units:
 *   - WAHA history + webhook echoes → Unix SECONDS  (~1.7e9)
 *   - Optimistic send tiles (Date.now) + fanout fallback → MILLISECONDS (~1.7e12)
 * `toMillis` normalizes both to milliseconds by magnitude so formatting,
 * sorting, and day-grouping are unit-agnostic.
 */

// Below this, a value is Unix seconds; at/above it, milliseconds.
// (1e12 ms ≈ year 2001; 1e12 s ≈ year 33658 — safe boundary for decades.)
const MS_THRESHOLD = 1e12;

const ONE_DAY_MS = 86_400_000;

/** Normalize a chat timestamp (seconds or ms) to milliseconds. */
export function toMillis(timestamp: number): number {
  return timestamp < MS_THRESHOLD ? timestamp * 1000 : timestamp;
}

/** Local midnight (ms) for the day containing `ms`. */
function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whether two timestamps fall on the same local calendar day. */
export function isSameDay(a: number, b: number): boolean {
  return startOfDayMs(toMillis(a)) === startOfDayMs(toMillis(b));
}

/** "14:05" — 24h time, es-AR. */
export function formatMessageTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(toMillis(timestamp)));
  } catch {
    return '';
  }
}

/** WhatsApp-style day divider label: "Hoy", "Ayer", or "8 de junio de 2026". */
export function formatDayLabel(timestamp: number): string {
  const day = startOfDayMs(toMillis(timestamp));
  const today = startOfDayMs(Date.now());
  if (day === today) return 'Hoy';
  if (day === today - ONE_DAY_MS) return 'Ayer';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(day));
  } catch {
    return '';
  }
}
