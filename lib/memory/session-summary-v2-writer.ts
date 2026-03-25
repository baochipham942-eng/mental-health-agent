import { upsertSessionSummaryV2 } from './data-bridge';
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
    if (!params.summary) return;

    await upsertSessionSummaryV2(params);
    logInfo('memory-v2-summary-upserted', {
      userId: params.userId,
      conversationId: params.conversationId,
      summaryLength: params.summary.length,
    });
  }
}


export const sessionSummaryV2Writer = new SessionSummaryV2Writer();
