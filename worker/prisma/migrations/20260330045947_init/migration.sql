-- CreateEnum
CREATE TYPE "FunctionCallStatus" AS ENUM ('success', 'failed', 'rejected');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('success', 'failed', 'unknown');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('deposit_money');

-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "jobId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionCallAudit" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "session" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "argumentsJson" JSONB NOT NULL,
    "status" "FunctionCallStatus" NOT NULL,
    "errorCode" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunctionCallAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationState" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "messageId" TEXT NOT NULL,
    "operationType" "OperationType" NOT NULL,
    "status" "OperationStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalUserSnapshot" (
    "id" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalUserSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessedMessage_chatId_idx" ON "ProcessedMessage"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedMessage_session_messageId_key" ON "ProcessedMessage"("session", "messageId");

-- CreateIndex
CREATE INDEX "FunctionCallAudit_jobId_idx" ON "FunctionCallAudit"("jobId");

-- CreateIndex
CREATE INDEX "FunctionCallAudit_messageId_idx" ON "FunctionCallAudit"("messageId");

-- CreateIndex
CREATE INDEX "FunctionCallAudit_toolName_idx" ON "FunctionCallAudit"("toolName");

-- CreateIndex
CREATE INDEX "OperationState_status_idx" ON "OperationState"("status");

-- CreateIndex
CREATE INDEX "OperationState_createdAt_idx" ON "OperationState"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalUserSnapshot_externalUserId_key" ON "ExternalUserSnapshot"("externalUserId");
