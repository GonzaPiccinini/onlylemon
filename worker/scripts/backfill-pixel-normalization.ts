/**
 * Backfill script: pixel-normalization-rekey (Change A, Phase 1 — Expand).
 *
 * Run AFTER the expand migration (20260629120000_pixel_normalization_expand)
 * has been applied. Safe to run multiple times — every step is idempotent.
 *
 * What it does:
 *   1. Upsert one MetaPixel row per distinct (metaPixelId, metaAccessToken) pair
 *      found in the Landing table. ON CONFLICT DO NOTHING ensures dedup.
 *   2. Set Landing.metaPixelRef → MetaPixel.id for every landing not yet populated.
 *   3. Set Lead.metaPixelRef, Lead.landingId, Lead.eventSourceUrl for every lead
 *      not yet populated, keyed by the Landing that owns that lead's old metaPixelId.
 *      Covers ALL statuses including in-flight NOT_CONTACTED leads.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/backfill-pixel-normalization.ts
 *
 * For testing, import runBackfill and pass any pg-connection-string.
 */
import { Client } from 'pg';

export async function runBackfill(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('[backfill] Starting pixel-normalization backfill...');

    // ── Step 1: Upsert MetaPixel rows ───────────────────────────────────────
    // One row per distinct (metaPixelId, metaAccessToken) from Landing.
    // ON CONFLICT on pixelId (unique) ensures idempotency and dedup.
    const metaPixelResult = await client.query(`
      INSERT INTO "MetaPixel" (id, "pixelId", "accessToken", "createdAt", "updatedAt")
      SELECT
        gen_random_uuid()::text,
        "metaPixelId",
        "metaAccessToken",
        NOW(),
        NOW()
      FROM "Landing"
      GROUP BY "metaPixelId", "metaAccessToken"
      ON CONFLICT ("pixelId") DO NOTHING
    `);
    console.log(`[backfill] Step 1: upserted ${metaPixelResult.rowCount ?? 0} MetaPixel row(s)`);

    // ── Step 2: Set Landing.metaPixelRef ────────────────────────────────────
    // Skips rows already populated (WHERE metaPixelRef IS NULL → idempotent).
    const landingResult = await client.query(`
      UPDATE "Landing" l
      SET "metaPixelRef" = mp.id
      FROM "MetaPixel" mp
      WHERE mp."pixelId" = l."metaPixelId"
        AND l."metaPixelRef" IS NULL
    `);
    console.log(`[backfill] Step 2: updated ${landingResult.rowCount ?? 0} Landing row(s)`);

    // ── Step 3: Set Lead.metaPixelRef + landingId + eventSourceUrl ──────────
    // Maps each lead's old metaPixelId string → the Landing that owned it (1:1 today)
    // → pulls metaPixelRef (FK), id (landingId), and url (eventSourceUrl) from Landing.
    // Skips rows already populated (WHERE metaPixelRef IS NULL → idempotent).
    const leadResult = await client.query(`
      UPDATE "Lead" ld
      SET
        "metaPixelRef"   = l."metaPixelRef",
        "landingId"      = l.id,
        "eventSourceUrl" = l.url
      FROM "Landing" l
      WHERE l."metaPixelId" = ld."metaPixelId"
        AND ld."metaPixelRef" IS NULL
    `);
    console.log(`[backfill] Step 3: updated ${leadResult.rowCount ?? 0} Lead row(s)`);

    console.log('[backfill] Done. All steps completed successfully.');
  } finally {
    await client.end();
  }
}

// ── Standalone runner ────────────────────────────────────────────────────────

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[backfill] ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

runBackfill(databaseUrl).catch((err: unknown) => {
  console.error('[backfill] FATAL:', err);
  process.exitCode = 1;
});
