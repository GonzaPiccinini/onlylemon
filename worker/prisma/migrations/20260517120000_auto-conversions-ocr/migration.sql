-- Migration: auto-conversions-ocr
-- Adds schema support for the auto-conversion via WhatsApp OCR feature.
--
-- Ordering:
--   1. ALTER TABLE Conversion ADD COLUMN source (backfill to 'MANUAL')
--   2. ALTER TABLE Conversion ADD COLUMN cashierId (backfill from Lead)
--   3. ALTER TABLE Conversion ADD COLUMN sourceMessageId
--   4. CREATE INDEX conversion_source_msg_idx
--   5. CREATE UNIQUE INDEX conversion_cashier_source_msg_uniq (partial)
--   6. CREATE INDEX lead_phone_digits (expression index for phone normalization)
--   7. CREATE TABLE SystemSetting

-- Step 1: Add source column to Conversion
ALTER TABLE "Conversion" ADD COLUMN "source" VARCHAR(16) DEFAULT 'MANUAL';

-- Backfill: all existing rows get source = 'MANUAL'
UPDATE "Conversion" SET "source" = 'MANUAL' WHERE "source" IS NULL;

-- Step 2: Add cashierId column to Conversion (denormalized for partial unique support)
ALTER TABLE "Conversion" ADD COLUMN "cashierId" TEXT;

-- Backfill: populate cashierId from the associated Lead
UPDATE "Conversion" c
SET "cashierId" = l."cashierId"
FROM "Lead" l
WHERE l."id" = c."leadId";

-- Step 3: Add sourceMessageId column to Conversion
ALTER TABLE "Conversion" ADD COLUMN "sourceMessageId" VARCHAR(128);

-- Step 4: Index on sourceMessageId for lookups
CREATE INDEX "conversion_source_msg_idx" ON "Conversion"("sourceMessageId");

-- Step 5: Partial unique index: one conversion per (cashier, sourceMessage)
-- NOTE: This is a partial unique (WHERE sourceMessageId IS NOT NULL) which Prisma
-- cannot express as @@unique in schema.prisma — defined here as a raw migration only.
CREATE UNIQUE INDEX "conversion_cashier_source_msg_uniq"
    ON "Conversion"("cashierId", "sourceMessageId")
    WHERE "sourceMessageId" IS NOT NULL;

-- Step 6: Expression index on Lead.phone for digit-only normalization
-- Used by auto-conversion phone matching query: regexp_replace(phone, '\D', '', 'g')
CREATE INDEX "lead_phone_digits"
    ON "Lead" ((regexp_replace("phone", '\D', '', 'g')));

-- Step 7: Create SystemSetting table for key-value store
-- NOTE: updatedAt uses TIMESTAMP(3) to match Prisma's convention (not TIMESTAMPTZ).
-- @updatedAt is managed at the application layer (no DB DEFAULT needed, but included for convenience).
CREATE TABLE "SystemSetting" (
    "key"       TEXT         NOT NULL,
    "value"     TEXT         NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- Prisma drift fix: WhatsappSession.updatedAt default was set in migration
-- 20260516120000_multi-waha-sessions but @updatedAt is application-managed;
-- drop the DB default to match the Prisma schema declaration.
ALTER TABLE "WhatsappSession" ALTER COLUMN "updatedAt" DROP DEFAULT;
