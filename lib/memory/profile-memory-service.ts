import { prisma } from '@/lib/db/prisma';
import type { ProfileMemoryRecord } from './v2-types';

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '的', '了', '是', '我', '你', '有', '在', '和', '这', '那',
    '就', '也', '都', '要', '会', '能', '到', '很', '但', '不',
    '吗', '呢', '啊', '吧', '呀', '哦',
  ]);

  return [...new Set(
    text
      .split(/[，。！？、；：""''（）\s]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2 && !stopWords.has(part))
  )];
}

function kindWeight(kind: string): number {
  switch (kind) {
    case 'trigger':
      return 30;
    case 'preference':
      return 20;
    case 'coping':
      return 15;
    case 'relationship':
      return 10;
    case 'identity':
    default:
      return 5;
  }
}

function relevanceScore(record: ProfileMemoryRecord, keywords: string[]): number {
  const keywordMatches = keywords.reduce((score, keyword) => {
    if (record.content.includes(keyword)) {
      return score + Math.min(keyword.length * 3, 12);
    }
    return score;
  }, 0);

  return (
    keywordMatches +
    kindWeight(record.kind) +
    Math.min(record.priority, 100) * 0.5 +
    Math.min(record.confidence, 1) * 20
  );
}

export class ProfileMemoryService {
  async listTop(userId: string, message: string, limit: number = 6): Promise<ProfileMemoryRecord[]> {
    const delegate = (prisma as any).profileMemory;
    if (!delegate) return [];

    const candidates = await delegate.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [
        { priority: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: Math.max(limit * 4, 20),
    });

    const keywords = extractKeywords(message);
    return candidates
      .map((record: ProfileMemoryRecord) => ({
        record,
        score: relevanceScore(record, keywords),
      }))
      .sort(
        (
          a: { record: ProfileMemoryRecord; score: number },
          b: { record: ProfileMemoryRecord; score: number }
        ) => b.score - a.score || b.record.updatedAt.getTime() - a.record.updatedAt.getTime()
      )
      .slice(0, limit)
      .map((item: { record: ProfileMemoryRecord; score: number }) => item.record);
  }
}

export const profileMemoryService = new ProfileMemoryService();
