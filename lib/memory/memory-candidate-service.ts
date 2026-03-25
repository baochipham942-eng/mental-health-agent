import { getConversationWithMessages, getConversationUserId, createManyCandidates } from './data-bridge';
import { extractMemoriesFromMessages } from './extractor';
import type { ConversationMessage, ExtractedMemory, MemoryTopic } from './types';
import type { MemoryKind } from './v2-types';
import { logInfo } from '@/lib/observability/logger';

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

    return extractMemoriesFromMessages(messages);
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
