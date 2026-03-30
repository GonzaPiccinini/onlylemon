DROP TABLE IF EXISTS "FunctionCallAudit";
DROP TABLE IF EXISTS "OperationState";
DROP TABLE IF EXISTS "ExternalUserSnapshot";

DROP TYPE IF EXISTS "FunctionCallStatus";
DROP TYPE IF EXISTS "OperationStatus";
DROP TYPE IF EXISTS "OperationType";

CREATE TABLE "ChatUser" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatTransaction" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatUser_chatId_key" ON "ChatUser"("chatId");
CREATE INDEX "ChatTransaction_chatId_idx" ON "ChatTransaction"("chatId");
CREATE INDEX "ChatTransaction_createdAt_idx" ON "ChatTransaction"("createdAt");
