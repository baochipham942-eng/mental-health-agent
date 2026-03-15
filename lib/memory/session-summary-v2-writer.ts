import { prisma } from '@/lib/db/prisma';
import { logInfo } from '@/lib/observability/logger';

export class SessionSummaryV2Writer {
  async upsert(params: {
    userId: string;
    conversationId: string;
    summary: string;
    emotionLabel?: string;
    emotionScore?: number;
    keyTopics?: string[];
    actionItems?: string[];
  }): Promise<void> {
    const delegate = (prisma as any).sessionSummaryV2;
    if (!delegate || !params.summary) return;

    // 只更新提供了的字段，不覆盖已有的 dashboard 字段
    await delegate.upsert({
      where: { conversationId: params.conversationId },
      update: {
        summary: params.summary,
        ...(params.emotionLabel !== undefined && { emotionLabel: params.emotionLabel || null }),
        ...(params.emotionScore !== undefined && { emotionScore: params.emotionScore ?? null }),
        ...(params.keyTopics !== undefined && { keyTopics: params.keyTopics || [] }),
        ...(params.actionItems !== undefined && { actionItems: params.actionItems || [] }),
      },
      create: {
        userId: params.userId,
        conversationId: params.conversationId,
        summary: params.summary,
        emotionLabel: params.emotionLabel || null,
        emotionScore: params.emotionScore ?? null,
        keyTopics: params.keyTopics || [],
        actionItems: params.actionItems || [],
      },
    });
    logInfo('memory-v2-summary-upserted', {
      userId: params.userId,
      conversationId: params.conversationId,
      summaryLength: params.summary.length,
    });
  }
}


export const sessionSummaryV2Writer = new SessionSummaryV2Writer();
