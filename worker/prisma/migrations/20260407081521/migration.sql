/*
  Warnings:

  - The values [NEW] on the enum `LEADS_STATUS` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `fbclid` on the `Leads` table. All the data in the column will be lost.
  - You are about to drop the column `publicId` on the `Leads` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `Leads` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Leads` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LEADS_STATUS_new" AS ENUM ('PENDING', 'CONTACTED', 'CONVERTED');
ALTER TABLE "Leads" ALTER COLUMN "status" TYPE "LEADS_STATUS_new" USING ("status"::text::"LEADS_STATUS_new");
ALTER TYPE "LEADS_STATUS" RENAME TO "LEADS_STATUS_old";
ALTER TYPE "LEADS_STATUS_new" RENAME TO "LEADS_STATUS";
DROP TYPE "public"."LEADS_STATUS_old";
COMMIT;

-- DropIndex
DROP INDEX "Leads_publicId_key";

-- AlterTable
ALTER TABLE "Leads" DROP COLUMN "fbclid",
DROP COLUMN "publicId",
ADD COLUMN     "code" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "Leads_code_key" ON "Leads"("code");
