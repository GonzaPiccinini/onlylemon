-- CreateTable
CREATE TABLE "Session" (
    "name" TEXT NOT NULL,
    "cvuNumber" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "sessionName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL,
    "hasMedia" BOOLEAN NOT NULL,
    "media" JSONB,
    "submittedByUser" BOOLEAN NOT NULL,
    "chatId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AddFunds" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "chatId" TEXT NOT NULL,
    "cvuNumber" TEXT NOT NULL,

    CONSTRAINT "AddFunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cvu" (
    "number" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_name_key" ON "Session"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Session_cvuNumber_key" ON "Session"("cvuNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_id_key" ON "Chat"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_chatId_key" ON "User"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_key" ON "Message"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Cvu_number_key" ON "Cvu"("number");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_cvuNumber_fkey" FOREIGN KEY ("cvuNumber") REFERENCES "Cvu"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_sessionName_fkey" FOREIGN KEY ("sessionName") REFERENCES "Session"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddFunds" ADD CONSTRAINT "AddFunds_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddFunds" ADD CONSTRAINT "AddFunds_cvuNumber_fkey" FOREIGN KEY ("cvuNumber") REFERENCES "Cvu"("number") ON DELETE RESTRICT ON UPDATE CASCADE;
