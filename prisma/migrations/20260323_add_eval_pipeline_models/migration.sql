-- Sprint 1: ConversationEvaluation 增加 evalSource
ALTER TABLE "ConversationEvaluation" ADD COLUMN "evalSource" TEXT NOT NULL DEFAULT 'manual';
CREATE INDEX "ConversationEvaluation_evalSource_idx" ON "ConversationEvaluation"("evalSource");

-- Sprint 3: PromptVersion 模型
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "parentId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptVersion_hash_key" ON "PromptVersion"("hash");
CREATE INDEX "PromptVersion_name_createdAt_idx" ON "PromptVersion"("name", "createdAt");

ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sprint 3: ConversationEvaluation 关联 PromptVersion
ALTER TABLE "ConversationEvaluation" ADD COLUMN "promptVersionId" TEXT;
ALTER TABLE "ConversationEvaluation" ADD CONSTRAINT "ConversationEvaluation_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sprint 4: ChatMetric 模型
CREATE TABLE "ChatMetric" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "errorType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMetric_createdAt_idx" ON "ChatMetric"("createdAt");
CREATE INDEX "ChatMetric_model_idx" ON "ChatMetric"("model");
CREATE INDEX "ChatMetric_conversationId_idx" ON "ChatMetric"("conversationId");
