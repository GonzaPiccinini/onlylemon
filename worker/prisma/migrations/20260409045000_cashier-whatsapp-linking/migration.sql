-- AlterTable
ALTER TABLE "Cashier" ADD COLUMN     "whatsappLinkRefreshCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsappLinkUpdatedAt" TIMESTAMP(3),
ALTER COLUMN "sessionName" DROP NOT NULL;

