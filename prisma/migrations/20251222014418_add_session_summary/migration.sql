-- CreateTable
CREATE TABLE "SessionSummary" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mainTopic" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "emotionInitial" JSONB NOT NULL,
    "emotionFinal" JSONB NOT NULL,
    "keyInsights" JSONB NOT NULL,
    "actionItems" JSONB NOT NULL,
    "keyTopics" JSONB NOT NULL,
    "therapistNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionSummary_conversationId_key" ON "SessionSummary"("conversationId");

-- CreateIndex
CREATE INDEX "SessionSummary_userId_idx" ON "SessionSummary"("userId");

-- CreateIndex
CREATE INDEX "SessionSummary_createdAt_idx" ON "SessionSummary"("createdAt");

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
