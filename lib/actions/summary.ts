'use server';

import { prisma } from '@/lib/db/prisma';
import { generateSessionSummary } from '@/lib/ai/summary';
import { evaluateAndSaveConversation } from './evaluation';

/**
 * 为指定会话生成摘要
 * 
 * @param conversationId - 会话 ID
 * @returns 生成的摘要数据，或 null（如果失败）
 */
export async function generateSummaryForSession(conversationId: string) {
    try {
        console.log('[Server Action] Generating summary for conversation:', conversationId);

        // 1. 查询会话和消息
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    select: {
                        role: true,
                        content: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });

        if (!conversation) {
            console.error('[Server Action] Conversation not found:', conversationId);
            return null;
        }

        // 2. 检查是否已有摘要（避免重复生成）
        const existingSummary = await prisma.sessionSummary.findUnique({
            where: { conversationId },
        });

        if (existingSummary) {
            console.log('[Server Action] Summary already exists, skipping generation');
            return existingSummary;
        }

        // 3. 检查消息数量（至少需要 2 条消息）
        if (conversation.messages.length < 2) {
            console.warn('[Server Action] Not enough messages for summary, need at least 2');
            return null;
        }

        // 4. 调用 AI 生成摘要
        const summaryData = await generateSessionSummary({
            id: conversation.id,
            userId: conversation.userId,
            messages: conversation.messages,
        });

        // 5. 保存到数据库
        const savedSummary = await prisma.sessionSummary.create({
            data: {
                conversationId: conversation.id,
                userId: conversation.userId,
                mainTopic: summaryData.mainTopic,
                startTime: summaryData.startTime,
                endTime: summaryData.endTime,
                duration: summaryData.duration,
                emotionInitial: summaryData.emotionInitial,
                emotionFinal: summaryData.emotionFinal,
                moodChange: summaryData.emotionFinal.score - summaryData.emotionInitial.score,
                keyInsights: summaryData.keyInsights,
                actionItems: summaryData.actionItems,
                keyTopics: summaryData.keyTopics,
                therapistNote: summaryData.therapistNote,
            },
        });

        console.log('[Server Action] Summary saved successfully:', savedSummary.id);

        // 🆕 6. 异步触发评估（不阻塞主流程）
        evaluateAndSaveConversation(conversationId).catch(err => {
            console.error('[Server Action] Evaluation trigger failed:', err);
        });

        return savedSummary;
    } catch (error) {
        console.error('[Server Action] Failed to generate summary:', error);
        return null;
    }
}

/**
 * 获取用户的所有会话摘要
 * 
 * @param userId - 用户 ID
 * @param limit - 返回数量限制（默认 10）
 * @returns 摘要列表
 */
export async function getUserSessionSummaries(userId: string, limit: number = 10) {
    try {
        const summaries = await prisma.sessionSummary.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                conversation: {
                    select: {
                        id: true,
                        title: true,
                        createdAt: true,
                    },
                },
            },
        });

        return summaries;
    } catch (error) {
        console.error('[Server Action] Failed to get summaries:', error);
        return [];
    }
}
