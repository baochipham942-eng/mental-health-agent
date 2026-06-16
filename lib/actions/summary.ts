'use server';

import { prisma } from '@/lib/db/prisma';
import { generateSessionSummary } from '@/lib/ai/summary';
import { evaluateAndSaveConversation } from './evaluation';
import { shouldSummarizeOnSessionEnd } from '@/lib/memory/summarizer';

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
        const existingSummary = await prisma.sessionSummaryV2.findUnique({
            where: { conversationId },
        });

        if (existingSummary) {
            console.log('[Server Action] Summary already exists, skipping generation');
            return existingSummary;
        }

        // 3. 检查用户回合数：短聊至少需要 2 个用户回合，避免问候和空泛单轮生成噪声摘要。
        if (!shouldSummarizeOnSessionEnd(conversation.messages)) {
            console.warn('[Server Action] Not enough user turns for summary, need at least 2');
            // 返回一个简单的 fallback 摘要（包含 UI 必需字段）
            return {
                id: 'fallback',
                conversationId,
                mainTopic: '简短对话',
                emotionInitial: { label: '待观察', score: 5 },
                emotionFinal: { label: '待观察', score: 5 },
                moodChange: 0,
                keyInsights: ['对话较短，暂无深入洞察'],
                actionItems: [],
                keyTopics: ['对话'],
                therapistNote: '这次对话时间较短，期待下次更深入的交流。',
            };
        }

        // 4. 调用 AI 生成摘要（带超时）
        const TIMEOUT_MS = 30000; // 30 秒超时

        const summaryDataPromise = generateSessionSummary({
            id: conversation.id,
            userId: conversation.userId,
            messages: conversation.messages,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Summary generation timeout after 30s')), TIMEOUT_MS)
        );

        let summaryData;
        try {
            summaryData = await Promise.race([summaryDataPromise, timeoutPromise]);
        } catch (aiError: any) {
            console.error('[Server Action] AI summary generation failed:', aiError.message);
            // 返回一个 fallback 摘要
            const firstMessage = conversation.messages[0];
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            return {
                id: 'fallback-' + Date.now(),
                conversationId,
                mainTopic: '心理咨询对话',
                startTime: firstMessage.createdAt,
                endTime: lastMessage.createdAt,
                emotionInitial: { label: '待分析', score: 5 },
                emotionFinal: { label: '待分析', score: 5 },
                moodChange: 0,
                keyInsights: ['本次咨询摘要生成超时，请稍后重试'],
                actionItems: [],
                keyTopics: ['咨询'],
                therapistNote: '感谢你的信任和分享。由于技术原因，详细摘要暂时无法生成，但你今天的付出是有意义的。',
            };
        }

        // 5. 保存到数据库（统一写入 V2）
        const savedSummary = await prisma.sessionSummaryV2.create({
            data: {
                conversationId: conversation.id,
                userId: conversation.userId,
                summary: summaryData.therapistNote || summaryData.mainTopic,
                emotionLabel: summaryData.emotionFinal?.label || null,
                emotionScore: summaryData.emotionFinal?.score ?? null,
                keyTopics: summaryData.keyTopics,
                actionItems: summaryData.actionItems,
                mainTopic: summaryData.mainTopic,
                startTime: summaryData.startTime,
                endTime: summaryData.endTime,
                duration: summaryData.duration,
                emotionInitial: summaryData.emotionInitial,
                moodChange: summaryData.emotionFinal.score - summaryData.emotionInitial.score,
                keyInsights: summaryData.keyInsights,
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
        // 返回一个最小化的 fallback 摘要，避免 UI 卡住（包含 UI 必需字段）
        return {
            id: 'error-fallback',
            conversationId,
            mainTopic: '咨询记录',
            emotionInitial: { label: '待分析', score: 5 },
            emotionFinal: { label: '待分析', score: 5 },
            moodChange: 0,
            keyInsights: ['摘要生成遇到问题'],
            actionItems: [],
            keyTopics: ['咨询'],
            therapistNote: '感谢你的信任。由于技术原因，本次摘要暂时无法生成。你的对话内容已安全保存。',
        };
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
        const summaries = await prisma.sessionSummaryV2.findMany({
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
