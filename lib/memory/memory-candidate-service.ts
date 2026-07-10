import {
  getConversationWithMessages,
  getConversationUserId,
  createManyCandidates,
  createExtractionLog,
  findLastExtractionSuccessAt,
} from './data-bridge';
import { extractMemoriesFromMessages } from './extractor';
import type { ConversationMessage, ExtractedMemory, MemoryTopic } from './types';
import type { MemoryKind } from './v2-types';
import { logInfo } from '@/lib/observability/logger';

export const MAX_MEMORIES_PER_EXTRACTION = 5;
export const MAX_MEMORIES_PER_KIND = 2;
// 触发降频：水位线之后攒够 3 个新用户回合才真正调 LLM 提取。
// 触发点（route.ts 每轮调用）不用改——不足门槛时这里直接短路成廉价 no-op。
export const MIN_NEW_USER_MESSAGES_FOR_EXTRACTION = 3;
const NEAR_DUPLICATE_THRESHOLD = 0.72;

function mapTopicToKind(topic: MemoryTopic): MemoryKind {
  switch (topic) {
    case 'coping_preference':
    case 'exercise_preference':
      return 'coping';
    case 'trigger_warning':
    case 'crisis_history':
    case 'emotional_pattern':
      return 'trigger';
    case 'communication_style':
      return 'preference';
    case 'relationship_dynamics':
      return 'relationship';
    case 'personal_context':
    case 'life_event':
    case 'core_belief':
    case 'strength_resource':
    case 'therapy_progress':
    default:
      return 'identity';
  }
}

function normalizeForSimilarity(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
    .trim();
}

function toBigrams(text: string): Set<string> {
  if (text.length <= 1) return new Set(text ? [text] : []);
  const grams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    grams.add(text.slice(i, i + 2));
  }
  return grams;
}

function contentSimilarity(a: string, b: string): number {
  const normalizedA = normalizeForSimilarity(a);
  const normalizedB = normalizeForSimilarity(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return Math.min(normalizedA.length, normalizedB.length) / Math.max(normalizedA.length, normalizedB.length);
  }

  const aGrams = toBigrams(normalizedA);
  const bGrams = toBigrams(normalizedB);
  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection++;
  }
  return intersection / Math.min(aGrams.size, bGrams.size);
}

function pickRicherMemory(current: ExtractedMemory, next: ExtractedMemory): ExtractedMemory {
  const currentScore = current.confidence + Math.min(current.content.length / 240, 0.25);
  const nextScore = next.confidence + Math.min(next.content.length / 240, 0.25);
  return nextScore > currentScore ? next : current;
}

export function dedupeExtractedMemories(memories: ExtractedMemory[]): ExtractedMemory[] {
  const deduped: ExtractedMemory[] = [];

  for (const memory of memories) {
    const content = memory.content.trim();
    if (!content) continue;

    const normalizedMemory = { ...memory, content };
    const kind = mapTopicToKind(normalizedMemory.topic);
    const duplicateIndex = deduped.findIndex(existing =>
      mapTopicToKind(existing.topic) === kind &&
      contentSimilarity(existing.content, normalizedMemory.content) >= NEAR_DUPLICATE_THRESHOLD
    );

    if (duplicateIndex >= 0) {
      deduped[duplicateIndex] = pickRicherMemory(deduped[duplicateIndex], normalizedMemory);
    } else {
      deduped.push(normalizedMemory);
    }
  }

  const perKindCount = new Map<MemoryKind, number>();
  const capped: ExtractedMemory[] = [];

  for (const memory of deduped) {
    const kind = mapTopicToKind(memory.topic);
    const count = perKindCount.get(kind) || 0;
    if (count >= MAX_MEMORIES_PER_KIND) continue;

    capped.push(memory);
    perKindCount.set(kind, count + 1);

    if (capped.length >= MAX_MEMORIES_PER_EXTRACTION) break;
  }

  return capped;
}

export class MemoryCandidateService {
  async save(userId: string, conversationId: string, memories: ExtractedMemory[]): Promise<void> {
    if (memories.length === 0) return;

    await createManyCandidates(
      memories.map((memory) => ({
        userId,
        conversationId,
        kind: mapTopicToKind(memory.topic),
        content: memory.content,
        confidence: memory.confidence,
        evidence: {
          topic: memory.topic,
          entities: memory.entities || [],
          relationships: memory.relationships || [],
        },
      })),
    );
    logInfo('memory-v2-candidates-saved', {
      userId,
      conversationId,
      count: memories.length,
    });
  }

  async extractAndSave(
    conversationId: string,
    opts: { force?: boolean } = {},
  ): Promise<ExtractedMemory[]> {
    const userId = await getConversationUserId(conversationId);
    if (!userId) return [];

    // 增量提取：只分析上次成功提取水位线之后的新消息，token 不随会话长度增长
    const lastExtractedAt = await findLastExtractionSuccessAt(conversationId);
    const conversation = await getConversationWithMessages(conversationId, lastExtractedAt ?? undefined);

    if (!conversation || conversation.messages.length < 2) {
      return [];
    }

    const messages: ConversationMessage[] = conversation.messages.map((m) => ({
      role: m.role as ConversationMessage['role'],
      content: m.content,
    }));

    const newUserMessages = messages.filter((m) => m.role === 'user').length;
    if (!opts.force && newUserMessages < MIN_NEW_USER_MESSAGES_FOR_EXTRACTION) {
      logInfo('memory-v2-extraction-deferred', { conversationId, newUserMessages });
      return [];
    }

    const extracted = await extractMemoriesFromMessages(messages);
    if (extracted === null) {
      // LLM 失败：不推进水位线，留 pending_retry 给 /api/cron/retry-memory
      await createExtractionLog({
        conversationId,
        extractedCount: 0,
        status: 'pending_retry',
        error: 'llm-extraction-failed',
      });
      return [];
    }

    const memories = dedupeExtractedMemories(extracted);
    await this.save(userId, conversationId, memories);
    // success 日志即水位线：这批消息（含提取出 0 条的情况）之后不再重复分析。
    // 水位线取最后一条已处理消息的时间，而非日志写入时间，避免竞态漏消息。
    await createExtractionLog({
      conversationId,
      extractedCount: memories.length,
      status: 'success',
      createdAt: conversation.messages[conversation.messages.length - 1].createdAt,
    });
    logInfo('memory-v2-candidates-extracted', {
      userId,
      conversationId,
      count: memories.length,
    });
    return memories;
  }
}

export const memoryCandidateService = new MemoryCandidateService();
