-- AlterTable
ALTER TABLE "User"
ADD COLUMN "name" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "AddFunds"
ADD COLUMN "userName" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "phoneId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "phoneNumber" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Lead"
ADD COLUMN "convertedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProcessedJob" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedJob_jobKey_key" ON "ProcessedJob"("jobKey");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");
