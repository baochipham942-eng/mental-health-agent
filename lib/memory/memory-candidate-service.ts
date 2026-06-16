import { getConversationWithMessages, getConversationUserId, createManyCandidates } from './data-bridge';
import { extractMemoriesFromMessages } from './extractor';
import type { ConversationMessage, ExtractedMemory, MemoryTopic } from './types';
import type { MemoryKind } from './v2-types';
import { logInfo } from '@/lib/observability/logger';

export const MAX_MEMORIES_PER_EXTRACTION = 5;
export const MAX_MEMORIES_PER_KIND = 2;
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
  async extractFromConversation(conversationId: string): Promise<ExtractedMemory[]> {
    const conversation = await getConversationWithMessages(conversationId);

    if (!conversation || conversation.messages.length < 2) {
      return [];
    }

    const messages: ConversationMessage[] = conversation.messages.map((m) => ({
      role: m.role as ConversationMessage['role'],
      content: m.content,
    }));

    return dedupeExtractedMemories(await extractMemoriesFromMessages(messages));
  }

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

  async extractAndSave(conversationId: string): Promise<ExtractedMemory[]> {
    const userId = await getConversationUserId(conversationId);
    if (!userId) return [];

    const memories = await this.extractFromConversation(conversationId);
    await this.save(userId, conversationId, memories);
    logInfo('memory-v2-candidates-extracted', {
      userId,
      conversationId,
      count: memories.length,
    });
    return memories;
  }
}

export const memoryCandidateService = new MemoryCandidateService();
