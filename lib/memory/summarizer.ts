/**
 * 对话摘要器
 * 负责将长对话历史压缩为摘要
 */

import { chatCompletion, type ChatMessage } from '@/lib/ai/deepseek';
import { CONVERSATION_SUMMARIZATION_PROMPT } from './prompts';
import { prisma } from '@/lib/db/prisma';

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
export function shouldSummarize(messageCount: number, currentThreshold: number = 20): boolean {
    return messageCount >= currentThreshold;
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

        await prisma.userMemory.create({
            data: {
                userId: (await prisma.conversation.findUnique({ where: { id: conversationId }, select: { userId: true } }))?.userId || '',
                topic: 'therapy_progress',
                content: `[会话摘要 ${new Date().toLocaleDateString()}] ${summary}`,
                confidence: 1.0,
                sourceConvId: conversationId
            }
        });
    } catch (error) {
        console.error('[Summarizer] Failed to update summary:', error);
    }
}
