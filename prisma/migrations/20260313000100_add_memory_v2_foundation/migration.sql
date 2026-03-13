-- CreateTable
CREATE TABLE "MemoryCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sourceConversationId" TEXT,
    "supersedes" TEXT,
    "lastConfirmedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSummaryV2" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "emotionLabel" TEXT,
    "emotionScore" INTEGER,
    "keyTopics" JSONB,
    "actionItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSummaryV2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryCandidate_userId_status_createdAt_idx" ON "MemoryCandidate"("userId", "status", "createdAt");
CREATE INDEX "MemoryCandidate_conversationId_idx" ON "MemoryCandidate"("conversationId");
CREATE INDEX "MemoryCandidate_userId_kind_idx" ON "MemoryCandidate"("userId", "kind");

-- CreateIndex
CREATE INDEX "ProfileMemory_userId_kind_priority_idx" ON "ProfileMemory"("userId", "kind", "priority");
CREATE INDEX "ProfileMemory_userId_deletedAt_updatedAt_idx" ON "ProfileMemory"("userId", "deletedAt", "updatedAt");
CREATE INDEX "ProfileMemory_sourceConversationId_idx" ON "ProfileMemory"("sourceConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSummaryV2_conversationId_key" ON "SessionSummaryV2"("conversationId");
CREATE INDEX "SessionSummaryV2_userId_createdAt_idx" ON "SessionSummaryV2"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MemoryCandidate" ADD CONSTRAINT "MemoryCandidate_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfileMemory" ADD CONSTRAINT "ProfileMemory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionSummaryV2" ADD CONSTRAINT "SessionSummaryV2_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
