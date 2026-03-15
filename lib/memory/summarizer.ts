/**
 * 对话摘要器
 * 负责将长对话历史压缩为摘要
 */

import { chatCompletion, type ChatMessage } from '@/lib/ai/deepseek';
import { CONVERSATION_SUMMARIZATION_PROMPT } from './prompts';
import { prisma } from '@/lib/db/prisma';
import { recordSessionMetrics } from '@/lib/ai/progress/tracker';
import { sessionSummaryV2Writer } from './session-summary-v2-writer';

/**
 * 为一组消息生成摘要
 */
export async function generateSummary(messages: Array<{ role: string; content: string }>): Promise<string> {
    if (messages.length === 0) return '';

    const historyText = messages
        .map(m => `[${m.role === 'user' ? '用户' : '咨询师'}]: ${m.content}`)
        .join('\n');

    const promptMessages: ChatMessage[] = [
        { role: 'system', content: CONVERSATION_SUMMARIZATION_PROMPT },
        { role: 'user', content: `请为以下对话记录生成摘要：\n\n${historyText}` }
    ];

    try {
        const result = await chatCompletion(promptMessages, {
            temperature: 0.3,
            max_tokens: 500
        });

        return result.reply.trim();
    } catch (error) {
        console.error('[Summarizer] Failed to generate summary:', error);
        return '';
    }
}

/**
 * 判断是否需要对会话进行摘要
 * 规则：消息数量超过 threshold 且距离上次摘要超过 gap 轮
 */
export function shouldSummarize(
    messageCount: number,
    currentThreshold: number = 20,
    summaryGap: number = 8
): boolean {
    if (messageCount < currentThreshold) return false;
    return (messageCount - currentThreshold) % summaryGap === 0;
}

/**
 * 存储或更新会话摘要（存入 Meta 中）
 */
export async function updateConversationSummary(conversationId: string, summary: string): Promise<void> {
    try {
        // 目前存入 conversation 的 meta 比较合适（虽然 schema 中没有显式字段，但可以存入辅助表或 Message 系统的 meta）
        // 方案：将摘要作为一个特殊的 system 消息存入，或者更新 conversation 某个扩展字段
        // 这里我们选择通过 Meta 字段注入（如果以后 schema 扩展了就直接用字段）
        // 暂时先存入最后一条消息的 meta 或者作为一个特殊的记忆点

        // 考虑到当前 schema，我们先不修改数据库结构，而是在运行时动态计算或通过 RAG 存储
        // 建议增加一个专门的记忆 Topic: 'conversation_summary'

        const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { userId: true } });
        const userId = conv?.userId || '';

        // 更新 V2 摘要文本（dashboard 字段已在 summary.ts 创建时写入）
        if (userId) {
            await sessionSummaryV2Writer.upsert({
                userId,
                conversationId,
                summary,
            });

            // 从 V2 读取情绪指标并记录到 ProgressMetric
            try {
                const v2 = await prisma.sessionSummaryV2.findUnique({
                    where: { conversationId },
                    select: { emotionLabel: true, emotionScore: true, moodChange: true },
                });
                if (v2 && v2.emotionScore != null) {
                    recordSessionMetrics(
                        userId,
                        conversationId,
                        { label: v2.emotionLabel || '', score: v2.emotionScore },
                        v2.moodChange,
                    ).catch(e => console.error('[ProgressTracker] Failed:', e));
                }
            } catch (e) {
                console.error('[ProgressTracker] Session metric extraction failed:', e);
            }
        }
    } catch (error) {
        console.error('[Summarizer] Failed to update summary:', error);
    }
}
