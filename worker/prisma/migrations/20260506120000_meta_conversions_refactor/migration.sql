-- Migration: meta_conversions_refactor
-- Stages A-E executed in order within a single migration file.
-- Pure SQL — no application code imported.

-- ── Stage A: Create Conversion table ────────────────────────────────────────

CREATE TABLE "Conversion" (
    "id"        TEXT NOT NULL,
    "leadId"    TEXT NOT NULL,
    "amount"    DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversion_leadId_createdAt_idx" ON "Conversion"("leadId", "createdAt" DESC);
CREATE INDEX "Conversion_createdAt_idx" ON "Conversion"("createdAt" DESC);

ALTER TABLE "Conversion"
    ADD CONSTRAINT "Conversion_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Stage B: Backfill CONVERTED leads → Conversion rows ─────────────────────
-- Each CONVERTED lead with amount IS NOT NULL and convertedAt IS NOT NULL
-- gets one Conversion row. createdAt is set from convertedAt.
-- No Meta event fired — pure SQL, no application code.

INSERT INTO "Conversion" ("id", "leadId", "amount", "createdAt")
SELECT
    gen_random_uuid()::text,
    id,
    amount,
    "convertedAt"
FROM "Lead"
WHERE status = 'CONVERTED'
  AND amount IS NOT NULL
  AND "convertedAt" IS NOT NULL;

-- ── Stage C: Backfill EXPIRED leads ─────────────────────────────────────────
-- EXPIRED + cashierId IS NOT NULL → CONTACTED (was in the cashier's queue)
-- EXPIRED + cashierId IS NULL     → NOT_CONTACTED (never assigned)

UPDATE "Lead"
    SET status = 'CONTACTED'
WHERE status = 'EXPIRED'
  AND "cashierId" IS NOT NULL;

UPDATE "Lead"
    SET status = 'NOT_CONTACTED'
WHERE status = 'EXPIRED'
  AND "cashierId" IS NULL;

-- ── Stage D: Drop deprecated columns from Lead ───────────────────────────────
-- Must happen AFTER Stage C so no row references the EXPIRED status.

ALTER TABLE "Lead"
    DROP COLUMN "expiresAt",
    DROP COLUMN "amount",
    DROP COLUMN "convertedAt";

-- ── Stage E: Swap LeadStatus enum (remove EXPIRED) ──────────────────────────
-- At this point, no Lead row has status = 'EXPIRED', so the USING cast is safe.

ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";

CREATE TYPE "LeadStatus" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'CONVERTED');

ALTER TABLE "Lead"
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE "Lead"
    ALTER COLUMN status TYPE "LeadStatus"
    USING status::text::"LeadStatus";

ALTER TABLE "Lead"
    ALTER COLUMN status SET DEFAULT 'NOT_CONTACTED';

DROP TYPE "LeadStatus_old";
