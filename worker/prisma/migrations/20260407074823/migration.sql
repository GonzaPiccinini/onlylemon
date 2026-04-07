-- CreateEnum
CREATE TYPE "LEADS_STATUS" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED');

-- AlterTable
ALTER TABLE "Chat" ALTER COLUMN "lock" SET DEFAULT true;

-- CreateTable
CREATE TABLE "Leads" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "fbclid" TEXT NOT NULL,
    "fbc" TEXT NOT NULL,
    "fbp" TEXT NOT NULL,
    "status" "LEADS_STATUS" NOT NULL,
    "userAgent" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Leads_publicId_key" ON "Leads"("publicId");
