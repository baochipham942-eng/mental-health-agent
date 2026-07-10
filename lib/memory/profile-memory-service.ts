import { findProfileMemoriesTop } from './data-bridge';
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

// 无关键词交集时的最低置信度门槛：低置信度记忆（如实验室单次推断，写入即 <0.5）
// 只在与当前消息有关键词交集时才注入，避免弱证据记忆出现在所有话题里。
// 0.6 取自主链路提取的常见置信度下沿（extractor 下限 0.5、典型 0.8+）。
export const MIN_STANDALONE_CONFIDENCE = 0.6;

function keywordMatchScore(record: ProfileMemoryRecord, keywords: string[]): number {
  return keywords.reduce((score, keyword) => {
    if (record.content.includes(keyword)) {
      return score + Math.min(keyword.length * 3, 12);
    }
    return score;
  }, 0);
}

function relevanceScore(record: ProfileMemoryRecord, keywordScore: number): number {
  return (
    keywordScore +
    kindWeight(record.kind) +
    Math.min(record.priority, 100) * 0.5 +
    Math.min(record.confidence, 1) * 20
  );
}

export class ProfileMemoryService {
  /** 按 userId 稳定的候选池（不依赖当前消息，可缓存） */
  async listCandidates(userId: string, limit: number = 6): Promise<ProfileMemoryRecord[]> {
    return findProfileMemoriesTop(userId, Math.max(limit * 4, 20));
  }

  /** 用当前消息对候选池重新排序/过滤（每轮调用，不可缓存结果） */
  rankTop(candidates: ProfileMemoryRecord[], message: string, limit: number = 6): ProfileMemoryRecord[] {
    const keywords = extractKeywords(message);
    return candidates
      .map((record) => ({ record, keywordScore: keywordMatchScore(record, keywords) }))
      .filter(({ record, keywordScore }) =>
        keywordScore > 0 || record.confidence >= MIN_STANDALONE_CONFIDENCE
      )
      .map(({ record, keywordScore }) => ({ record, score: relevanceScore(record, keywordScore) }))
      .sort((a, b) => b.score - a.score || b.record.updatedAt.getTime() - a.record.updatedAt.getTime())
      .slice(0, limit)
      .map((item) => item.record);
  }

  async listTop(userId: string, message: string, limit: number = 6): Promise<ProfileMemoryRecord[]> {
    return this.rankTop(await this.listCandidates(userId, limit), message, limit);
  }
}

export const profileMemoryService = new ProfileMemoryService();
