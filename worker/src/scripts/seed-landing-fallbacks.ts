/**
 * seed-landing-fallbacks.ts
 *
 * Backfill script: inserts curated LandingFallbackPhone rows before deploying
 * the lead-phone-fallback-chain change. The new worker throws HTTP 500
 * (FALLBACK_INVARIANT_VIOLATION) if L1+L2 both fail and the table is empty
 * for that landing, so this MUST be run and verified before the new build
 * goes live.
 *
 * Usage:
 *   DATABASE_URL=<url> tsx src/scripts/seed-landing-fallbacks.ts
 *
 * Exit codes:
 *   0 — all rows inserted or already present (idempotent success)
 *   1 — validation error or missing landingId (no rows were inserted)
 *
 * How to populate SEEDS:
 *   1. Get the landingId values from the DB or admin dashboard.
 *   2. Add one entry per fallback phone you want to seed.
 *   3. `phone` must match ^\+?[0-9]{8,15}$ (8–15 digits, optional + prefix).
 *   4. `label` and `order` are optional.
 *   5. Re-running is safe: duplicate (landingId, phone) pairs are silently skipped.
 *
 * Example entry (uncomment and fill in real values):
 *   { landingId: "cuid_or_uuid_here", phone: "5491112345678", label: "Soporte", order: 1 },
 */

import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

// ---------------------------------------------------------------------------
// Edit this array before running. Leave empty → script exits with "nothing
// to seed" and code 0.
// ---------------------------------------------------------------------------
interface SeedEntry {
  landingId: string;
  phone: string;
  label?: string;
  order?: number;
}

const SEEDS: SeedEntry[] = [
  {
    landingId: '212627e2-1273-4bb9-b80e-7d8c5d326500',
    phone: '5493513207794',
    label: 'Cristian Soporte',
    order: 1,
  },
  {
    landingId: '90c3e4bc-8f70-4e6f-a04f-5fc70271f04c',
    phone: '5493513207794',
    label: 'Cristian Soporte',
    order: 1,
  },
  {
    landingId: 'ef154391-72cc-471c-a824-6ffb6b6cc9b7',
    phone: '5493513207794',
    label: 'Cristian Soporte',
    order: 1,
  },
  {
    landingId: 'c6346388-8d70-47fc-b4b4-45150c3e350b',
    phone: '5493513207794',
    label: 'Cristian Soporte',
    order: 1,
  },
];
// ---------------------------------------------------------------------------

const PHONE_RE = /^\+?[0-9]{8,15}$/;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

if (SEEDS.length === 0) {
  console.log('SEEDS array is empty — nothing to seed. Exiting 0.');
  process.exit(0);
}

// --- Phase 1: validate phones before touching the DB ----------------------
let hasInvalidPhone = false;
for (const entry of SEEDS) {
  if (!PHONE_RE.test(entry.phone)) {
    console.error(
      `ERROR: invalid phone "${entry.phone}" for landingId "${entry.landingId}". ` +
        `Must match ^\+?[0-9]{8,15}$ (8–15 digits, optional + prefix).`,
    );
    hasInvalidPhone = true;
  }
}
if (hasInvalidPhone) {
  console.error(
    'Aborting: fix phone format errors above. No rows were inserted.',
  );
  process.exit(1);
}

// --- Phase 2: connect and run pre-flight + insert -------------------------
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();

  // Pre-flight: verify every landingId exists
  const uniqueLandingIds = [...new Set(SEEDS.map((s) => s.landingId))];
  const existsResult = await client.query<{ id: string }>(
    `SELECT id FROM "Landing" WHERE id = ANY($1::text[])`,
    [uniqueLandingIds],
  );
  const foundIds = new Set(existsResult.rows.map((r) => r.id));
  const missingIds = uniqueLandingIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    console.error(
      `ERROR: the following landingId(s) do not exist in the Landing table:`,
    );
    for (const id of missingIds) {
      console.error(`  ${id}`);
    }
    console.error(
      'Aborting: fix missing landingIds above. No rows were inserted.',
    );
    process.exit(1);
  }

  // Insert with idempotency
  let inserted = 0;
  let skipped = 0;

  for (const entry of SEEDS) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO "LandingFallbackPhone" (id, "landingId", phone, label, "order", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("landingId", phone) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        entry.landingId,
        entry.phone,
        entry.label ?? null,
        entry.order ?? 0,
      ],
    );

    if (result.rowCount && result.rowCount > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(
    `Inserted ${inserted} rows; ${skipped} skipped (already existed); 0 errors.`,
  );
  process.exit(0);
} finally {
  await client.end();
}
