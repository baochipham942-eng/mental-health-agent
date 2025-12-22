-- CreateTable
CREATE TABLE "ConversationEvaluation" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalScore" INTEGER NOT NULL,
    "ethicalScore" INTEGER NOT NULL,
    "professionalScore" INTEGER NOT NULL,
    "uxScore" INTEGER NOT NULL,
    "legalIssues" JSONB NOT NULL,
    "ethicalIssues" JSONB NOT NULL,
    "professionalIssues" JSONB NOT NULL,
    "uxIssues" JSONB NOT NULL,
    "overallGrade" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "improvements" JSONB NOT NULL,
    "evaluatedBy" TEXT NOT NULL DEFAULT 'deepseek',
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptOptimizationLog" (
    "id" TEXT NOT NULL,
    "analyzedPeriod" TEXT NOT NULL,
    "lowScoreCount" INTEGER NOT NULL,
    "commonIssues" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "affectedPrompts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,

    CONSTRAINT "PromptOptimizationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationEvaluation_conversationId_key" ON "ConversationEvaluation"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationEvaluation_userId_idx" ON "ConversationEvaluation"("userId");

-- CreateIndex
CREATE INDEX "ConversationEvaluation_overallGrade_idx" ON "ConversationEvaluation"("overallGrade");

-- CreateIndex
CREATE INDEX "ConversationEvaluation_evaluatedAt_idx" ON "ConversationEvaluation"("evaluatedAt");

-- CreateIndex
CREATE INDEX "ConversationEvaluation_overallScore_idx" ON "ConversationEvaluation"("overallScore");

-- CreateIndex
CREATE INDEX "PromptOptimizationLog_createdAt_idx" ON "PromptOptimizationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ConversationEvaluation" ADD CONSTRAINT "ConversationEvaluation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvaluation" ADD CONSTRAINT "ConversationEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
