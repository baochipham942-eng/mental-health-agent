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

/**
 * 按 userId 稳定的记忆源快照（可安全缓存）。
 * 检索排序依赖当前 message，不能整体缓存 MemoryContextResult——
 * 缓存只存候选池，每轮用当前消息重新排序/过滤后再生成注入文本。
 */
export interface MemorySourceSnapshot {
  candidates: ProfileMemoryRecord[];
  recentSummaries: SessionSummaryV2Record[];
  sessionMetadataText: string;
}

export interface MemoryContextResult {
  profileMemories: ProfileMemoryRecord[];
  recentSummaries: SessionSummaryV2Record[];
  injectedText: string;
  source: 'memory-v2';
  metrics?: {
    totalDurationMs: number;
    profileQueryDurationMs: number;
    summaryQueryDurationMs: number;
  };
}
