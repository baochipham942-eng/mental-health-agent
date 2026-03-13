import { prisma } from '@/lib/db/prisma';
import { consolidateMemory } from './consolidator';
import type { ExtractedMemory, Memory, MemoryTopic } from './types';
import type { MemoryKind } from './v2-types';
import { logInfo } from '@/lib/observability/logger';
import { buildMemoryFingerprint } from './fingerprint';

function normalizeContent(content: string): string[] {
  return [...new Set(
    content
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  )];
}

function overlapRatio(a: string, b: string): number {
  const aTokens = normalizeContent(a);
  const bTokens = normalizeContent(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) overlap++;
  }
  return overlap / Math.max(Math.min(aTokens.length, bTokens.length), 1);
}

function findNearDuplicate(
  content: string,
  existingRows: Array<{
    id: string;
    content: string;
    confidence: number;
  }>
) {
  let best: { id: string; content: string; confidence: number; score: number } | null = null;
  for (const row of existingRows) {
    const score = overlapRatio(content, row.content);
    if (score >= 0.6 && (!best || score > best.score)) {
      best = { ...row, score };
    }
  }
  return best;
}

function findFingerprintMatch(
  kind: MemoryKind,
  fingerprint: string,
  existingRows: Array<{
    id: string;
    content: string;
    confidence: number;
    fingerprint?: string | null;
  }>
) {
  for (const row of existingRows) {
    const rowFingerprint = row.fingerprint || buildMemoryFingerprint(kind, row.content);
    if (rowFingerprint === fingerprint) {
      return row;
    }
  }
  return null;
}

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

function kindPriority(kind: MemoryKind): number {
  switch (kind) {
    case 'trigger':
      return 90;
    case 'preference':
      return 80;
    case 'coping':
      return 75;
    case 'relationship':
      return 65;
    case 'identity':
    default:
      return 60;
  }
}

function toLegacyMemory(row: any): Memory {
  return {
    id: row.id,
    userId: row.userId,
    topic: (row.kind === 'coping'
      ? 'coping_preference'
      : row.kind === 'trigger'
        ? 'trigger_warning'
        : row.kind === 'preference'
          ? 'communication_style'
          : row.kind === 'relationship'
            ? 'relationship_dynamics'
            : 'personal_context') as MemoryTopic,
    content: row.content,
    confidence: row.confidence,
    sourceConvId: row.sourceConversationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accessedAt: row.lastConfirmedAt || row.updatedAt,
    accessCount: 1,
    stabilityFactor: 1,
    memoryStrength: 1,
  };
}

export class ProfileMemoryMergeService {
  async mergeExtractedMemories(
    userId: string,
    conversationId: string,
    memories: ExtractedMemory[],
  ): Promise<void> {
    const delegate = (prisma as any).profileMemory;
    const candidateDelegate = (prisma as any).memoryCandidate;
    if (!delegate || memories.length === 0) return;

    let created = 0;
    let updated = 0;
    let rejected = 0;

    for (const memory of memories) {
      const kind = mapTopicToKind(memory.topic);
      const fingerprint = buildMemoryFingerprint(kind, memory.content);
      const existingRows = await delegate.findMany({
        where: {
          userId,
          kind,
          deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });

      const fingerprintMatch = findFingerprintMatch(kind, fingerprint, existingRows);
      if (fingerprintMatch) {
        await delegate.update({
          where: { id: fingerprintMatch.id },
          data: {
            content: memory.content.length > fingerprintMatch.content.length ? memory.content : fingerprintMatch.content,
            confidence: Math.max(memory.confidence, fingerprintMatch.confidence),
            sourceConversationId: conversationId,
            lastConfirmedAt: new Date(),
            fingerprint,
          },
        });
        updated++;

        if (candidateDelegate) {
          await candidateDelegate.updateMany({
            where: {
              userId,
              conversationId,
              content: memory.content,
            },
            data: {
              status: 'merged',
            },
          });
        }

        continue;
      }

      const localDuplicate = findNearDuplicate(memory.content, existingRows);
      if (localDuplicate) {
        const shouldUpdate =
          memory.content.length > localDuplicate.content.length * 1.1 ||
          memory.confidence > localDuplicate.confidence;

        if (shouldUpdate) {
          await delegate.update({
            where: { id: localDuplicate.id },
            data: {
              content: memory.content,
              confidence: Math.max(memory.confidence, localDuplicate.confidence),
              sourceConversationId: conversationId,
              lastConfirmedAt: new Date(),
              fingerprint,
            },
          });
          updated++;
        } else {
          await delegate.update({
            where: { id: localDuplicate.id },
            data: {
              confidence: Math.max(memory.confidence, localDuplicate.confidence),
              sourceConversationId: conversationId,
              lastConfirmedAt: new Date(),
              fingerprint,
            },
          });
          rejected++;
        }

        if (candidateDelegate) {
          await candidateDelegate.updateMany({
            where: {
              userId,
              conversationId,
              content: memory.content,
            },
            data: {
              status: shouldUpdate ? 'merged' : 'rejected',
            },
          });
        }

        continue;
      }

      const consolidation = await consolidateMemory(
        memory,
        existingRows.map(toLegacyMemory),
      );

      if (consolidation.action === 'create') {
        await delegate.create({
          data: {
            userId,
            kind,
            fingerprint,
            content: memory.content,
            priority: kindPriority(kind),
            confidence: memory.confidence,
            sourceConversationId: conversationId,
            lastConfirmedAt: new Date(),
          },
        });
        created++;
      } else if (consolidation.action === 'update' && consolidation.targetMemoryId) {
        await delegate.update({
          where: { id: consolidation.targetMemoryId },
          data: {
            content: consolidation.mergedContent || memory.content,
            confidence: Math.max(memory.confidence, 0.8),
            sourceConversationId: conversationId,
            lastConfirmedAt: new Date(),
            fingerprint,
          },
        });
        updated++;
      } else if (consolidation.action === 'skip') {
        rejected++;
      }

      if (candidateDelegate) {
        await candidateDelegate.updateMany({
          where: {
            userId,
            conversationId,
            content: memory.content,
          },
          data: {
            status: consolidation.action === 'skip' ? 'rejected' : 'merged',
          },
        });
      }
    }

    logInfo('memory-v2-profile-merge-complete', {
      userId,
      conversationId,
      total: memories.length,
      created,
      updated,
      rejected,
    });
  }
}

export const profileMemoryMergeService = new ProfileMemoryMergeService();
