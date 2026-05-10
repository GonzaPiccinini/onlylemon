/**
 * Pure business logic for auditing ACTIVE landings without fallback phones.
 * Factored out of the CLI script for testability.
 *
 * The CLI script (`scripts/audit-landings-without-fallbacks.ts`) is a thin wrapper
 * that connects to Postgres and delegates to this function.
 */

export type LandingWithoutFallback = {
  id: string;
  metaPixelId: string;
  url: string;
};

export type AuditQueryFn = () => Promise<LandingWithoutFallback[]>;

export type AuditResult =
  | { ok: true }
  | { ok: false; violatingIds: string[]; rows: LandingWithoutFallback[] };

/**
 * Checks whether any ACTIVE landings lack at least one fallback phone.
 * Returns `{ ok: true }` when all landings are compliant, or
 * `{ ok: false, violatingIds, rows }` when offending landings exist.
 *
 * @param queryFn — injectable function that returns rows from the DB query.
 *   In production, this runs the real SQL. In tests, a stub is used.
 */
export async function auditLandingsWithoutFallbacks(
  queryFn: AuditQueryFn,
): Promise<AuditResult> {
  const rows = await queryFn();

  if (rows.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    violatingIds: rows.map((r) => r.id),
    rows,
  };
}
