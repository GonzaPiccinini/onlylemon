-- Migration: pixel_normalization_contract (Phase 5 — Contract / Tighten)
--
-- Precondition: the Expand migration (20260629120000_pixel_normalization_expand)
-- and the backfill script have already run. All Landing.metaPixelRef and
-- Lead.metaPixelRef / landingId / eventSourceUrl are fully populated (NOT NULL in practice).
--
-- Steps:
--   1. Drop transitional FK constraints (Expand used SET NULL / SET NULL; Contract replaces with RESTRICT).
--   2. Drop the unique index on the OLD Landing.metaPixelId scalar.
--   3. Drop the OLD scalar columns: Landing.metaPixelId, Landing.metaAccessToken, Lead.metaPixelId.
--   4. Rename the transitional FK columns to their final names: metaPixelRef → metaPixelId.
--   5. Apply NOT NULL on all renamed / tightened columns.
--   6. Add final FK constraints with ON DELETE RESTRICT.

-- ── Step 1: Drop transitional FK constraints ────────────────────────────────

ALTER TABLE "Landing" DROP CONSTRAINT IF EXISTS "Landing_metaPixelRef_fkey";
ALTER TABLE "Lead"    DROP CONSTRAINT IF EXISTS "Lead_metaPixelRef_fkey";
ALTER TABLE "Lead"    DROP CONSTRAINT IF EXISTS "Lead_landingId_fkey";

-- ── Step 2: Drop unique index on old Landing.metaPixelId scalar ─────────────

DROP INDEX IF EXISTS "Landing_metaPixelId_key";

-- ── Step 3: Drop old scalar columns ─────────────────────────────────────────
-- Landing.metaPixelId was the pixel NUMBER string (e.g. "976916338006290"),
-- now replaced by the FK UUID column (renamed from metaPixelRef below).
-- Landing.metaAccessToken: server-side token moved to MetaPixel.accessToken.
-- Lead.metaPixelId was the pixel NUMBER string, replaced by FK UUID.

ALTER TABLE "Landing" DROP COLUMN IF EXISTS "metaPixelId";
ALTER TABLE "Landing" DROP COLUMN IF EXISTS "metaAccessToken";
ALTER TABLE "Lead"    DROP COLUMN IF EXISTS "metaPixelId";

-- ── Step 4: Rename transitional FK columns to final names ───────────────────

ALTER TABLE "Landing" RENAME COLUMN "metaPixelRef" TO "metaPixelId";
ALTER TABLE "Lead"    RENAME COLUMN "metaPixelRef" TO "metaPixelId";

-- ── Step 5: Apply NOT NULL constraints ──────────────────────────────────────
-- All rows were backfilled in Step 3 of the backfill script — safe to apply.

ALTER TABLE "Landing" ALTER COLUMN "metaPixelId"    SET NOT NULL;
ALTER TABLE "Lead"    ALTER COLUMN "metaPixelId"    SET NOT NULL;
ALTER TABLE "Lead"    ALTER COLUMN "landingId"      SET NOT NULL;
ALTER TABLE "Lead"    ALTER COLUMN "eventSourceUrl" SET NOT NULL;

-- ── Step 6: Add final FK constraints with ON DELETE RESTRICT ─────────────────
-- RESTRICT prevents deletion of a MetaPixel that is still referenced by any
-- Landing or Lead — enforcing referential integrity at the DB level.

ALTER TABLE "Landing"
    ADD CONSTRAINT "Landing_metaPixelId_fkey"
    FOREIGN KEY ("metaPixelId") REFERENCES "MetaPixel"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_metaPixelId_fkey"
    FOREIGN KEY ("metaPixelId") REFERENCES "MetaPixel"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Lead"
    ADD CONSTRAINT "Lead_landingId_fkey"
    FOREIGN KEY ("landingId") REFERENCES "Landing"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
