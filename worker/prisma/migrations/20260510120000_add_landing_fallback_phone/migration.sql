-- CreateTable
CREATE TABLE "LandingFallbackPhone" (
    "id" TEXT NOT NULL,
    "landingId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingFallbackPhone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingFallbackPhone_landingId_idx" ON "LandingFallbackPhone"("landingId");

-- CreateIndex
CREATE UNIQUE INDEX "LandingFallbackPhone_landingId_phone_key" ON "LandingFallbackPhone"("landingId", "phone");

-- AddForeignKey
ALTER TABLE "LandingFallbackPhone" ADD CONSTRAINT "LandingFallbackPhone_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
