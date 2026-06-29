-- Migration: pixel_normalization_expand (Phase 1 — Expand, additive only)
--
-- Adds the MetaPixel table and nullable transitional FK columns on Landing and Lead.
-- Old scalar columns (Landing.metaPixelId, Landing.metaAccessToken, Lead.metaPixelId)
-- are kept intact until the Contract migration (Phase 5).
-- No data is written here — a separate backfill script populates the new columns.

-- CreateTable
CREATE TABLE "MetaPixel" (
    "id" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaPixel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: MetaPixel.pixelId unique
CREATE UNIQUE INDEX "MetaPixel_pixelId_key" ON "MetaPixel"("pixelId");

-- AlterTable Landing: add transitional FK column + whatsappMessages
ALTER TABLE "Landing"
    ADD COLUMN "metaPixelRef"      TEXT,
    ADD COLUMN "whatsappMessages"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable Lead: add transitional FK column + snapshot fields
ALTER TABLE "Lead"
    ADD COLUMN "metaPixelRef"    TEXT,
    ADD COLUMN "eventSourceUrl"  TEXT,
    ADD COLUMN "landingId"       TEXT;

-- CreateIndex: Lead.landingId (for future re-keyed queries)
CREATE INDEX "Lead_landingId_idx" ON "Lead"("landingId");

-- AddForeignKey: Landing.metaPixelRef → MetaPixel.id
ALTER TABLE "Landing" ADD CONSTRAINT "Landing_metaPixelRef_fkey"
    FOREIGN KEY ("metaPixelRef") REFERENCES "MetaPixel"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Lead.metaPixelRef → MetaPixel.id
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_metaPixelRef_fkey"
    FOREIGN KEY ("metaPixelRef") REFERENCES "MetaPixel"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Lead.landingId → Landing.id
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_landingId_fkey"
    FOREIGN KEY ("landingId") REFERENCES "Landing"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
