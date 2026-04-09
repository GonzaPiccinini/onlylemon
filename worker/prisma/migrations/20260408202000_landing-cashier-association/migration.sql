-- CreateEnum
CREATE TYPE "LandingStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- DropForeignKey
ALTER TABLE "Chat" DROP CONSTRAINT "Chat_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_cashierId_fkey";

-- DropForeignKey
ALTER TABLE "SessionActivity" DROP CONSTRAINT "SessionActivity_sessionId_fkey";

-- AlterTable
ALTER TABLE "AddFunds" DROP COLUMN "phoneId",
ALTER COLUMN "userName" DROP DEFAULT,
ALTER COLUMN "phoneNumber" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Cashier" ADD COLUMN     "sessionName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "sessionId",
ADD COLUMN     "cashierId" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SessionActivity" DROP COLUMN "sessionId",
ADD COLUMN     "cashierId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" DROP DEFAULT;

-- DropTable
DROP TABLE "Session";

-- CreateTable
CREATE TABLE "Landing" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "metaPixelId" TEXT NOT NULL,
    "metaAccessToken" TEXT NOT NULL,
    "status" "LandingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Landing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashierLanding" (
    "cashierId" TEXT NOT NULL,
    "landingId" TEXT NOT NULL,

    CONSTRAINT "CashierLanding_pkey" PRIMARY KEY ("cashierId","landingId")
);

-- CreateIndex
CREATE INDEX "CashierLanding_cashierId_idx" ON "CashierLanding"("cashierId");

-- CreateIndex
CREATE INDEX "CashierLanding_landingId_idx" ON "CashierLanding"("landingId");

-- CreateIndex
CREATE UNIQUE INDEX "Cashier_sessionName_key" ON "Cashier"("sessionName");

-- AddForeignKey
ALTER TABLE "SessionActivity" ADD CONSTRAINT "SessionActivity_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "Cashier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "Cashier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierLanding" ADD CONSTRAINT "CashierLanding_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "Cashier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierLanding" ADD CONSTRAINT "CashierLanding_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

