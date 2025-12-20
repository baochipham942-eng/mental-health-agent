/**
 * 记忆检索器
 * 从数据库中检索相关记忆
 * 
 * 支持两种检索模式：
 * 1. 静态检索：按topic/时间检索
 * 2. 语义检索：根据当前上下文检索相关记忆（简化版）
 */

import { prisma } from '@/lib/db/prisma';
import type { Memory, MemoryTopic, MemoryRetrievalOptions, ALL_MEMORY_TOPICS } from './types';

/**
 * 获取用户的记忆列表
 * @param userId 用户ID
 * @param options 检索选项
 */
export async function retrieveMemories(
    userId: string,
    options: MemoryRetrievalOptions = {}
): Promise<Memory[]> {
    const {
        topics,
        limit = 20,
        minConfidence = 0.5,
    } = options;

    const where: any = {
        userId,
        confidence: { gte: minConfidence },
    };

    if (topics && topics.length > 0) {
        where.topic = { in: topics };
    }

    const memories = await prisma.userMemory.findMany({
        where,
        orderBy: [
            { updatedAt: 'desc' },
            { confidence: 'desc' },
        ],
        take: limit,
    });

    // 更新accessedAt
    if (memories.length > 0) {
        const ids = memories.map(m => m.id);
        await prisma.userMemory.updateMany({
            where: { id: { in: ids } },
            data: { accessedAt: new Date() },
        }).catch(err => {
            console.error('[MemoryRetriever] Failed to update accessedAt:', err);
        });
    }

    return memories.map(m => ({
        id: m.id,
        userId: m.userId,
        topic: m.topic as MemoryTopic,
        content: m.content,
        confidence: m.confidence,
        sourceConvId: m.sourceConvId,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        accessedAt: m.accessedAt,
    }));
}

/**
 * 根据当前消息上下文检索相关记忆
 * 简化版：基于关键词匹配，未来可升级为向量检索
 */
export async function retrieveRelevantMemories(
    userId: string,
    currentMessage: string,
    options: MemoryRetrievalOptions = {}
): Promise<Memory[]> {
    const { limit = 10, minConfidence = 0.5 } = options;

    // 提取关键词（简化版）
    const keywords = extractKeywords(currentMessage);

    if (keywords.length === 0) {
        // 无关键词，返回最近的记忆
        return retrieveMemories(userId, { limit: 5, minConfidence });
    }

    // 获取所有记忆
    const allMemories = await retrieveMemories(userId, { limit: 50, minConfidence });

    // 基于关键词相关性排序
    const scored = allMemories.map(memory => {
        let score = 0;
        for (const keyword of keywords) {
            if (memory.content.includes(keyword)) {
                score += keyword.length > 2 ? 2 : 1;
            }
        }
        // 加入时间衰减因子
        const daysSinceUpdate = (Date.now() - memory.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
        const recencyBoost = Math.max(0, 1 - daysSinceUpdate / 30);

        return {
            memory,
            score: score + recencyBoost + memory.confidence,
        };
    });

    // 排序并返回top N
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.memory);
}

/**
 * 获取用户在特定topic下的记忆
 */
export async function getMemoriesByTopic(
    userId: string,
    topic: MemoryTopic
): Promise<Memory[]> {
    return retrieveMemories(userId, { topics: [topic], limit: 20 });
}

/**
 * 获取最近更新的记忆
 */
export async function getRecentMemories(
    userId: string,
    limit: number = 10
): Promise<Memory[]> {
    return retrieveMemories(userId, { limit });
}

/**
 * 简单关键词提取
 */
function extractKeywords(text: string): string[] {
    // 移除常见停用词
    const stopWords = new Set([
        '的', '了', '是', '我', '你', '有', '在', '和', '这', '那',
        '就', '也', '都', '要', '会', '能', '到', '很', '但', '不',
        '吗', '呢', '啊', '吧', '咧', '嘛', '呀', '哦', '噢', '诶',
    ]);

    // 分词（简单按标点和空格分割）
    const segments = text.split(/[，。！？、；：""''（）\s]+/)
        .filter(s => s.length >= 2 && !stopWords.has(s));

    // 去重
    return [...new Set(segments)];
}

/**
 * Memory-as-a-Tool 格式
 * 可以暴露给Agent调用
 */
export const memoryToolDefinition = {
    name: 'recall_user_memory',
    description: '回忆用户的历史信息，如情绪模式、偏好策略、个人背景等',
    parameters: {
        type: 'object',
        properties: {
            topic: {
                type: 'string',
                enum: ['emotional_pattern', 'coping_preference', 'personal_context', 'therapy_progress', 'trigger_warning'],
                description: '要查询的记忆类型',
            },
            query: {
                type: 'string',
                description: '可选的查询关键词',
            },
        },
    },
};

/**
 * Memory Tool 实现
 */
export async function executeMemoryTool(
    userId: string,
    params: { topic?: MemoryTopic; query?: string }
): Promise<string> {
    const { topic, query } = params;

    let memories: Memory[];
    if (topic) {
        memories = await getMemoriesByTopic(userId, topic);
    } else if (query) {
        memories = await retrieveRelevantMemories(userId, query);
    } else {
        memories = await getRecentMemories(userId, 5);
    }

    if (memories.length === 0) {
        return '没有找到相关记忆。';
    }

    const formattedMemories = memories
        .map(m => `- [${m.topic}] ${m.content}`)
        .join('\n');

    return `找到${memories.length}条相关记忆：\n${formattedMemories}`;
}
