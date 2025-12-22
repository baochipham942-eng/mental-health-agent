'use server';

import { prisma } from '@/lib/db/prisma';
import { evaluateConversationQuality } from '@/lib/ai/evaluation';

/**
 * 评估并保存对话质量
 * 
 * @param conversationId - 对话 ID
 * @returns 评估结果，或 null（如果失败）
 */
export async function evaluateAndSaveConversation(conversationId: string) {
    try {
        console.log('[Evaluation Action] Starting evaluation for:', conversationId);

        // 1. 查询对话
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
            console.error('[Evaluation Action] Conversation not found:', conversationId);
            return null;
        }

        // 2. 检查是否已评估
        const existing = await prisma.conversationEvaluation.findUnique({
            where: { conversationId },
        });

        // 如果已有完成的评估（非EVALUATING状态），则跳过
        if (existing && existing.overallGrade !== 'EVALUATING') {
            console.log('[Evaluation Action] Already evaluated, skipping');
            return existing;
        }

        // 3. 检查消息数量（至少需要 2 条消息）
        if (conversation.messages.length < 2) {
            console.warn('[Evaluation Action] Not enough messages for evaluation, need at least 2');
            return null;
        }

        // 4. 调用 AI 评估
        const result = await evaluateConversationQuality({
            id: conversation.id,
            userId: conversation.userId,
            messages: conversation.messages,
        });

        // 5. 保存到数据库（更新已有记录或创建新记录）
        let saved;
        if (existing) {
            // 更新已有的待评估记录
            saved = await prisma.conversationEvaluation.update({
                where: { conversationId },
                data: {
                    legalScore: result.legalCompliance.score,
                    ethicalScore: result.ethicalStandard.score,
                    professionalScore: result.professionalism.score,
                    uxScore: result.userExperience.score,
                    legalIssues: result.legalCompliance.issues,
                    ethicalIssues: result.ethicalStandard.issues,
                    professionalIssues: result.professionalism.issues,
                    uxIssues: result.userExperience.issues,
                    overallGrade: result.overallGrade,
                    overallScore: result.overallScore,
                    improvements: result.improvements,
                    evaluatedAt: new Date(),
                },
            });
        } else {
            // 创建新记录
            saved = await prisma.conversationEvaluation.create({
                data: {
                    conversationId: conversation.id,
                    userId: conversation.userId,
                    legalScore: result.legalCompliance.score,
                    ethicalScore: result.ethicalStandard.score,
                    professionalScore: result.professionalism.score,
                    uxScore: result.userExperience.score,
                    legalIssues: result.legalCompliance.issues,
                    ethicalIssues: result.ethicalStandard.issues,
                    professionalIssues: result.professionalism.issues,
                    uxIssues: result.userExperience.issues,
                    overallGrade: result.overallGrade,
                    overallScore: result.overallScore,
                    improvements: result.improvements,
                },
            });
        }

        console.log('[Evaluation Action] Saved successfully:', {
            id: saved.id,
            grade: saved.overallGrade,
            score: saved.overallScore,
        });

        return saved;
    } catch (error) {
        console.error('[Evaluation Action] Failed:', error);
        return null;
    }
}
