-- Create new lead status enum
CREATE TYPE "LeadStatus" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'CONVERTED', 'EXPIRED');

-- Remove chat/add-funds domain
DROP TABLE IF EXISTS "AddFunds";
DROP TABLE IF EXISTS "Chat";

-- Alter Lead for new business model
ALTER TABLE "Lead"
ADD COLUMN "metaPixelId" TEXT,
ADD COLUMN "amount" DECIMAL(10,2),
ADD COLUMN "cashierId" TEXT,
ADD COLUMN "contactedAt" TIMESTAMP(3);

UPDATE "Lead"
SET
  "metaPixelId" = 'pixel-seed-a',
  "cashierId" = NULL,
  "contactedAt" = "matchedAt";

ALTER TABLE "Lead"
ALTER COLUMN "metaPixelId" SET NOT NULL;

ALTER TABLE "Lead"
DROP COLUMN "matchedAt";

ALTER TABLE "Lead"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Lead"
ALTER COLUMN "status" TYPE "LeadStatus" USING (
  CASE "status"
    WHEN 'PENDING' THEN 'NOT_CONTACTED'::"LeadStatus"
    WHEN 'CONTACTED' THEN 'CONTACTED'::"LeadStatus"
    WHEN 'CONVERTED' THEN 'CONVERTED'::"LeadStatus"
    WHEN 'EXPIRED' THEN 'EXPIRED'::"LeadStatus"
    ELSE 'NOT_CONTACTED'::"LeadStatus"
  END
),
ALTER COLUMN "status" SET DEFAULT 'NOT_CONTACTED';

DROP TYPE "LEADS_STATUS";

-- Backfill sensible defaults where possible
UPDATE "Landing"
SET "metaPixelId" = "id"
WHERE "metaPixelId" IS NULL OR "metaPixelId" = '';

-- New uniqueness/indexing rules
CREATE UNIQUE INDEX IF NOT EXISTS "Landing_metaPixelId_key" ON "Landing"("metaPixelId");
CREATE INDEX IF NOT EXISTS "Lead_cashierId_status_contactedAt_idx" ON "Lead"("cashierId", "status", "contactedAt");

-- New relation
ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_cashierId_fkey"
FOREIGN KEY ("cashierId") REFERENCES "Cashier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
