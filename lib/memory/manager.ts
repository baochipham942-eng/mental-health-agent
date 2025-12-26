/**
 * 记忆管理器
 * 统一协调记忆的提取、整合、存储和检索
 */

import { prisma } from '@/lib/db/prisma';
import { extractMemoriesFromMessages } from './extractor';
import { consolidateMemory } from './consolidator';
import { retrieveRelevantMemories, retrieveMemories } from './retriever';
import { formatMemoriesForInjection } from './prompts';
import { redactPII } from './redact';
import type {
    Memory,
    ExtractedMemory,
    MemoryTopic,
    ConversationMessage,
    ExtractionStatus,
} from './types';

export class MemoryManager {
    /**
     * 处理会话结束后的记忆提取
     */
    async processConversation(conversationId: string): Promise<void> {
        try {
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    messages: { orderBy: { createdAt: 'asc' }, take: 50 },
                },
            });

            if (!conversation || conversation.messages.length < 2) {
                await this.logExtraction(conversationId, 0, 'skipped', '消息数量不足');
                return;
            }

            const userId = conversation.userId;
            const messages: ConversationMessage[] = conversation.messages.map(m => ({
                role: m.role as any,
                content: m.content,
            }));

            const extractedMemories = await extractMemoriesFromMessages(messages);
            if (extractedMemories.length === 0) {
                await this.logExtraction(conversationId, 0, 'success', '无有效记忆提取');
                return;
            }

            const existingMemories = await prisma.userMemory.findMany({ where: { userId } });
            const existingByTopic = new Map<string, Memory[]>();
            for (const m of existingMemories) {
                if (!existingByTopic.has(m.topic)) existingByTopic.set(m.topic, []);
                existingByTopic.get(m.topic)!.push({
                    id: m.id,
                    userId: m.userId,
                    topic: m.topic as MemoryTopic,
                    content: m.content,
                    entities: (m as any).entities,
                    relationships: (m as any).relationships,
                    confidence: m.confidence,
                    sourceConvId: m.sourceConvId,
                    createdAt: m.createdAt,
                    updatedAt: m.updatedAt,
                    accessedAt: m.accessedAt,
                    accessCount: m.accessCount,
                    stabilityFactor: m.stabilityFactor,
                    memoryStrength: m.memoryStrength,
                });
            }

            let createdCount = 0;
            let updatedCount = 0;

            for (const extracted of extractedMemories) {
                const existingForTopic = existingByTopic.get(extracted.topic) || [];
                const result = await consolidateMemory(extracted, existingForTopic);

                switch (result.action) {
                    case 'create':
                        await prisma.userMemory.create({
                            data: {
                                userId,
                                topic: extracted.topic,
                                content: redactPII(extracted.content),
                                entities: (extracted.entities || null) as any,
                                relationships: (extracted.relationships || null) as any,
                                confidence: extracted.confidence,
                                sourceConvId: conversationId,
                            },
                        });
                        createdCount++;
                        break;
                    case 'update':
                        if (result.targetMemoryId && result.mergedContent) {
                            await prisma.userMemory.update({
                                where: { id: result.targetMemoryId },
                                data: {
                                    content: redactPII(result.mergedContent),
                                    entities: (extracted.entities || undefined) as any,
                                    relationships: (extracted.relationships || undefined) as any,
                                    confidence: Math.max(
                                        extracted.confidence,
                                        existingForTopic.find(m => m.id === result.targetMemoryId)?.confidence || 0
                                    ),
                                    sourceConvId: conversationId,
                                },
                            });
                            updatedCount++;
                        }
                        break;
                    case 'delete':
                        if (result.targetMemoryId) {
                            await prisma.userMemory.delete({ where: { id: result.targetMemoryId } });
                        }
                        break;
                }
            }

            await this.logExtraction(conversationId, createdCount + updatedCount, 'success');
        } catch (error) {
            console.error('[MemoryManager] Error:', error);
            await this.logExtraction(conversationId, 0, 'failed', String(error));
        }
    }

    async getMemoriesForContext(
        userId: string,
        currentMessage: string
    ): Promise<{ memories: Memory[]; contextString: string }> {
        const memories = await retrieveRelevantMemories(userId, currentMessage, {
            limit: 10,
            minConfidence: 0.6,
        });
        const contextString = formatMemoriesForInjection(memories);
        return { memories, contextString };
    }

    async getAllMemories(userId: string): Promise<Memory[]> {
        return retrieveMemories(userId, { limit: 100 });
    }

    async forgetMemory(memoryId: string, userId: string): Promise<boolean> {
        try {
            const memory = await prisma.userMemory.findUnique({
                where: { id: memoryId },
                select: { userId: true },
            });
            if (!memory || memory.userId !== userId) return false;
            await prisma.userMemory.delete({ where: { id: memoryId } });
            return true;
        } catch { return false; }
    }

    async pruneStaleMemories(userId: string, options: { maxAge?: number; minConfidence?: number } = {}): Promise<number> {
        const { maxAge = 90, minConfidence = 0.5 } = options;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAge);
        try {
            const result = await prisma.userMemory.deleteMany({
                where: {
                    userId,
                    OR: [
                        { accessedAt: { lt: cutoffDate } },
                        { confidence: { lt: minConfidence } },
                    ],
                },
            });
            return result.count;
        } catch { return 0; }
    }

    private async logExtraction(conversationId: string, extractedCount: number, status: ExtractionStatus, error?: string): Promise<void> {
        try {
            await prisma.memoryExtractionLog.create({
                data: { conversationId, extractedCount, status, error },
            });
        } catch { }
    }
}

export const memoryManager = new MemoryManager();
