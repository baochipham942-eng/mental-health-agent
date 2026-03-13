export type MemoryKind =
  | 'identity'
  | 'preference'
  | 'trigger'
  | 'coping'
  | 'relationship';

export interface ProfileMemoryRecord {
  id: string;
  userId: string;
  kind: MemoryKind | string;
  fingerprint?: string | null;
  content: string;
  priority: number;
  confidence: number;
  sourceConversationId?: string | null;
  supersedes?: string | null;
  lastConfirmedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionSummaryV2Record {
  id: string;
  userId: string;
  conversationId: string;
  summary: string;
  emotionLabel?: string | null;
  emotionScore?: number | null;
  keyTopics?: unknown;
  actionItems?: unknown;
  createdAt: Date;
}

export interface MemoryContextResult {
  profileMemories: ProfileMemoryRecord[];
  recentSummaries: SessionSummaryV2Record[];
  injectedText: string;
  source: 'memory-v2' | 'legacy';
  metrics?: {
    totalDurationMs: number;
    profileQueryDurationMs: number;
    summaryQueryDurationMs: number;
  };
}
