/**
 * auto-conversion/repository.ts
 *
 * Repository for the auto-conversion feature.
 * Provides phone-based lead lookup using the lead_phone_digits generated index
 * (created in Batch 1 migration: regexp_replace(phone, '\D', '', 'g')).
 *
 * Only leads in status CONTACTED or CONVERTED are eligible for conversion.
 */

import { prisma } from '../../persistence/prisma/client.js';
import type { Lead } from '../../generated/prisma/client.js';

// ---------------------------------------------------------------------------
// Phone normalization helper
// ---------------------------------------------------------------------------

/**
 * Normalizes a phone number to digits only.
 * Strips WAHA's @c.us suffix, +, spaces, dashes, parentheses, and any other
 * non-digit characters — matching the regexp_replace(phone, '\D', '', 'g')
 * expression used in the database index.
 */
export function normalizePhoneDigitsOnly(raw: string): string {
  return raw.replace(/@c\.us$/, '').replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// Lead lookup
// ---------------------------------------------------------------------------

/**
 * Finds the most recently created lead for a cashier whose phone number
 * matches the given phone (digits-only comparison, using the generated index).
 *
 * Only returns leads in status CONTACTED or CONVERTED.
 * Returns null if no match is found.
 */
export async function findMostRecentLeadByPhoneForCashier(
  phone: string,
  cashierId: string,
): Promise<Lead | null> {
  const normalized = normalizePhoneDigitsOnly(phone);

  const results = await prisma.$queryRaw<Lead[]>`
    SELECT * FROM "Lead"
    WHERE "cashierId" = ${cashierId}
      AND status IN ('CONTACTED', 'CONVERTED')
      AND regexp_replace(phone, '\D', '', 'g') = ${normalized}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

  return results[0] ?? null;
}
