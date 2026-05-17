-- Migration: multi-waha-sessions
-- Promotes WhatsappSession to a first-class routing entity.
-- Drops CashierLanding + per-Cashier session fields after backfill.
--
-- Ordering (all in one transaction):
--   1. CREATE TABLE WhatsappSession
--   2. CREATE TABLE WhatsappSessionLanding
--   3. ALTER TABLE Cashier ADD COLUMN maxSessions
--   4. Backfill: INSERT WhatsappSession from Cashier.sessionName (non-null rows)
--   5. Backfill: INSERT WhatsappSessionLanding from CashierLanding
--   6. DROP TABLE CashierLanding
--   7. ALTER TABLE Cashier DROP COLUMN deprecated session fields

-- Step 1: Create WhatsappSession table
-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "sessionName" TEXT NOT NULL,
    "whatsappPhoneNumber" TEXT,
    "refreshCount" INTEGER NOT NULL DEFAULT 0,
    "lastRefreshAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_sessionName_key" ON "WhatsappSession"("sessionName");

-- CreateIndex
CREATE INDEX "WhatsappSession_cashierId_idx" ON "WhatsappSession"("cashierId");

-- Step 2: Create WhatsappSessionLanding join table
-- CreateTable
CREATE TABLE "WhatsappSessionLanding" (
    "sessionId" TEXT NOT NULL,
    "landingId" TEXT NOT NULL,

    CONSTRAINT "WhatsappSessionLanding_pkey" PRIMARY KEY ("sessionId","landingId")
);

-- CreateIndex
CREATE INDEX "WhatsappSessionLanding_sessionId_idx" ON "WhatsappSessionLanding"("sessionId");

-- CreateIndex
CREATE INDEX "WhatsappSessionLanding_landingId_idx" ON "WhatsappSessionLanding"("landingId");

-- Step 3: Add maxSessions to Cashier
-- AlterTable
ALTER TABLE "Cashier" ADD COLUMN "maxSessions" INTEGER NOT NULL DEFAULT 1;

-- Step 4: Backfill WhatsappSession from existing Cashier rows with a sessionName
-- Each non-null sessionName cashier gets exactly one WhatsappSession
INSERT INTO "WhatsappSession" (
    "id",
    "cashierId",
    "sessionName",
    "whatsappPhoneNumber",
    "refreshCount",
    "lastRefreshAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    "sessionName",
    "whatsappPhoneNumber",
    "whatsappLinkRefreshCount",
    "whatsappLinkUpdatedAt",
    now(),
    now()
FROM "Cashier"
WHERE "sessionName" IS NOT NULL;

-- Step 5: Backfill WhatsappSessionLanding from CashierLanding
-- Each CashierLanding (cashierId, landingId) maps to the session we just created for that cashier
INSERT INTO "WhatsappSessionLanding" ("sessionId", "landingId")
SELECT
    s."id",
    cl."landingId"
FROM "CashierLanding" cl
JOIN "WhatsappSession" s ON s."cashierId" = cl."cashierId";

-- Step 6: Drop CashierLanding (no longer needed)
-- DropTable
DROP TABLE "CashierLanding";

-- Step 7: Drop deprecated Cashier session fields
-- AlterTable
ALTER TABLE "Cashier"
    DROP COLUMN "sessionName",
    DROP COLUMN "whatsappPhoneNumber",
    DROP COLUMN "whatsappLinkRefreshCount",
    DROP COLUMN "whatsappLinkUpdatedAt";

-- AddForeignKey: WhatsappSession -> Cashier
ALTER TABLE "WhatsappSession" ADD CONSTRAINT "WhatsappSession_cashierId_fkey"
    FOREIGN KEY ("cashierId") REFERENCES "Cashier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WhatsappSessionLanding -> WhatsappSession (Cascade)
ALTER TABLE "WhatsappSessionLanding" ADD CONSTRAINT "WhatsappSessionLanding_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "WhatsappSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WhatsappSessionLanding -> Landing (Cascade)
ALTER TABLE "WhatsappSessionLanding" ADD CONSTRAINT "WhatsappSessionLanding_landingId_fkey"
    FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
