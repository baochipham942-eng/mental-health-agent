import { chatStructuredCompletion, ChatMessage } from './deepseek';
import { z } from 'zod';
import { SESSION_SUMMARY_PROMPT } from './prompts';

/**
 * 情绪状态 Schema
 */
export const EmotionSchema = z.object({
    label: z.string().describe('情绪类型：焦虑/抑郁/愤怒/悲伤/恐惧/快乐/平静'),
    score: z.number().min(0).max(10).describe('情绪强度：0-10'),
});

/**
 * 会话摘要 Schema
 */
export const SessionSummarySchema = z.object({
    mainTopic: z.string().max(100).describe('主要议题，简洁描述（≤100字）'),
    emotionInitial: EmotionSchema.describe('初始情绪状态'),
    emotionFinal: EmotionSchema.describe('结束时情绪状态'),
    keyInsights: z.array(z.string().max(100)).min(1).max(5).describe('关键洞察，每条≤100字'),
    actionItems: z.array(z.string().max(100)).min(0).max(5).describe('下一步行动，每条≤100字'),
    keyTopics: z.array(z.string()).min(1).max(5).describe('核心主题关键词（3-5个）'),
    therapistNote: z.string().max(500).describe('咨询师专业观察（≤500字）'),
});

export type Emotion = z.infer<typeof EmotionSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/**
 * 会话数据类型（与 Prisma 兼容）
 */
export interface SessionData {
    id: string;
    userId: string;
    messages: Array<{
        role: string;
        content: string;
        createdAt: Date | string;
    }>;
}

/**
 * 生成会话摘要（核心函数）
 * 
 * @param session - 会话数据（包含消息历史）
 * @returns 完整的会话摘要（包含时间和时长）
 */
export async function generateSessionSummary(
    session: SessionData
): Promise<SessionSummary & { startTime: Date; endTime: Date; duration: number }> {
    // 1. 提取有效对话（排除空消息）
    const validMessages = session.messages
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({
            role: m.role,
            content: m.content,
            createdAt: typeof m.createdAt === 'string' ? new Date(m.createdAt) : m.createdAt,
        }))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (validMessages.length === 0) {
        throw new Error('No valid messages for summary generation');
    }

    // 2. 限制输入长度（最多最近 50 条消息，避免超出 token 限制）
    const recentMessages = validMessages.slice(-50);

    // 3. 构建对话历史文本
    const conversationText = recentMessages
        .map((m, i) => {
            const role = m.role === 'user' ? '用户' : 'AI咨询师';
            return `[${i + 1}] ${role}: ${m.content}`;
        })
        .join('\n\n');

    // 4. 准备 Prompt
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: SESSION_SUMMARY_PROMPT,
        },
        {
            role: 'user',
            content: `对话历史（共 ${recentMessages.length} 条消息）：\n\n${conversationText}`,
        },
    ];

    // 5. 调用 DeepSeek 生成摘要
    console.log('[Summary] Generating session summary...');
    const summary = await chatStructuredCompletion(
        messages,
        SessionSummarySchema,
        {
            temperature: 0.3, // 低温度确保稳定输出
            max_tokens: 1200,
        }
    );

    // 6. 计算会话时长
    const startTime = validMessages[0].createdAt;
    const endTime = validMessages[validMessages.length - 1].createdAt;
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000 / 60); // 分钟

    console.log('[Summary] Generated successfully:', {
        mainTopic: summary.mainTopic,
        duration,
        insightsCount: summary.keyInsights.length,
    });

    return {
        ...summary,
        startTime,
        endTime,
        duration,
    };
}
