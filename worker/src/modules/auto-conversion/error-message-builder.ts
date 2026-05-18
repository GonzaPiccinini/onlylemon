/**
 * Rich-format builder for auto-conversion error replies.
 *
 * Output (Option B layout — locked per iteration v1.1 contract):
 *
 *   ❌ Carga automática fallida
 *   👤 Cliente: +54 9 3472 502 738
 *   🕐 21:35:42
 *   🏷️ Lead: QA-AUTOCONV-001          ← only when leadCode provided
 *   💵 Monto leído: $7.500            ← only when amount provided
 *   ⚠️ Motivo: <toSpanishReply(error)>
 */

import { toSpanishReply } from './errors.js';

export type BuildErrorReplyInput = {
  /** The error thrown during auto-conversion */
  error: unknown;
  /** Raw client phone (digits-only or @c.us-suffixed JID). Required. */
  clientPhone: string;
  /** ISO timestamp of when the error happened. Required. */
  whenIso: string;
  /** Lead code, if `findLeadByPhoneForCashier` resolved it before the error */
  leadCode?: string | null;
  /** Amount in ARS, if OCR extracted it before the error (e.g. amount-out-of-range case) */
  amount?: number | null;
};

// AR mobile: 549 + 10-digit number → split as 4-3-3 (matches user-facing spec)
// e.g. 5493472502738 → "+54 9 3472 502 738"
const PHONE_AR_MOBILE_RE = /^549(\d{4})(\d{3})(\d{3})$/;
// AR landline: 54 + 10-digit number → split as 4-3-3
const PHONE_AR_LANDLINE_RE = /^54(\d{4})(\d{3})(\d{3})$/;

function normalizeDigits(raw: string): string {
  return raw.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '');
}

function formatPhone(raw: string): string {
  const digits = normalizeDigits(raw);
  const m = digits.match(PHONE_AR_MOBILE_RE);
  if (m) {
    return `+54 9 ${m[1]} ${m[2]} ${m[3]}`;
  }
  const ml = digits.match(PHONE_AR_LANDLINE_RE);
  if (ml) {
    return `+54 ${ml[1]} ${ml[2]} ${ml[3]}`;
  }
  return digits ? `+${digits}` : raw;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

const ARS_FORMAT = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function formatARS(amount: number): string {
  return ARS_FORMAT.format(amount).replace(/\s/g, ''); // drop NBSP between $ and number
}

export function buildErrorReply(input: BuildErrorReplyInput): string {
  const lines: string[] = ['❌ Carga automática fallida'];

  lines.push(`👤 Cliente: ${formatPhone(input.clientPhone)}`);
  lines.push(`🕐 ${formatTime(input.whenIso)}`);

  if (input.leadCode) {
    lines.push(`🏷️ Lead: ${input.leadCode}`);
  }

  if (typeof input.amount === 'number' && Number.isFinite(input.amount)) {
    lines.push(`💵 Monto leído: ${formatARS(input.amount)}`);
  }

  lines.push(`⚠️ Motivo: ${toSpanishReply(input.error)}`);

  return lines.join('\n');
}
