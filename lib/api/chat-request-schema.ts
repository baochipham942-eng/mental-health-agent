/**
 * 聊天类 API 的请求体校验 schema（服务端可信边界）
 *
 * /api/chat 与 /api/chat/group 直接接受客户端传入的 history/messages，
 * 这里统一收口：role 只允许 user/assistant（runtime 伪造的 system 角色直接拒绝）、
 * 单条长度、总条数、总字符数钳制，圆桌 mentorId 过 getMentor 白名单。
 */
import { z } from 'zod';
import { getMentor } from '@/lib/ai/mentors/personas';

export const CHAT_LIMITS = {
    messageMaxChars: 8_000,
    historyMaxItems: 200,
    historyItemMaxChars: 8_000,
    historyTotalMaxChars: 200_000,
} as const;

export const GROUP_LIMITS = {
    maxMessages: 300,
    messageItemMaxChars: 8_000,
    messagesTotalMaxChars: 300_000,
    topicMaxChars: 500,
} as const;

const historyItemSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(CHAT_LIMITS.historyItemMaxChars),
});

/**
 * 客户端发的是全量会话历史（长会话会自然超过 schema 上限），
 * 服务端在 safeParse 前钳制而非拒绝：条数/单条长度/总字符数都裁到限内，
 * 丢最旧的、留最近的（服务端只消费近几轮）。schema 的 max 保留作最终防线。
 */
export function clampChatHistory(history: unknown): unknown {
    if (!Array.isArray(history)) return history;
    const items = history.slice(-CHAT_LIMITS.historyMaxItems).map((m) => {
        const content = (m as Record<string, unknown> | null)?.content;
        return typeof content === 'string' && content.length > CHAT_LIMITS.historyItemMaxChars
            ? { ...(m as Record<string, unknown>), content: content.slice(0, CHAT_LIMITS.historyItemMaxChars) }
            : m;
    });
    const len = (m: unknown) => {
        const content = (m as Record<string, unknown> | null)?.content;
        return typeof content === 'string' ? content.length : 0;
    };
    let total = items.reduce((sum, m) => sum + len(m), 0);
    while (items.length > 0 && total > CHAT_LIMITS.historyTotalMaxChars) {
        total -= len(items.shift());
    }
    return items;
}

export const chatBodySchema = z.object({
    message: z.string().min(1).max(CHAT_LIMITS.messageMaxChars),
    sessionId: z.string().max(128).nullish(),
    history: z
        .array(historyItemSchema)
        .max(CHAT_LIMITS.historyMaxItems)
        .refine(
            (h) => h.reduce((sum, m) => sum + m.content.length, 0) <= CHAT_LIMITS.historyTotalMaxChars,
            '历史消息总长度超限',
        )
        .optional(),
    state: z.enum(['normal', 'awaiting_followup', 'in_crisis']).nullish(),
    assessmentStage: z.enum(['intake', 'conclusion']).nullish(),
});

const groupMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(GROUP_LIMITS.messageItemMaxChars),
    mentorId: z.string().max(64).nullish(),
    round: z.number().int().nullish(),
});

export const LAB_LIMITS = {
    maxMessages: 200,
    messageItemMaxChars: 8_000,
    customNameMaxChars: 50,
    customPromptMaxChars: 4_000,
} as const;

// v6 UIMessage 只有 parts 没有 content，content 允许缺省；
// role 是安全边界（runtime 伪造 system 直接拒），长度走钳制不拒绝
const labMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z
        .string()
        .transform((s) => s.slice(0, LAB_LIMITS.messageItemMaxChars))
        .nullish(),
});

const labMessagesSchema = z
    .array(labMessageSchema)
    .min(1)
    .transform((arr) => arr.slice(-LAB_LIMITS.maxMessages));

// 自定义大师：只收敛服务端真正消费的字段（name/systemPrompt/id），其余剥离
export const customMentorSchema = z.object({
    id: z.string().max(64).optional(),
    name: z
        .string()
        .min(1)
        .transform((s) => s.slice(0, LAB_LIMITS.customNameMaxChars)),
    systemPrompt: z
        .string()
        .min(1)
        .transform((s) => s.slice(0, LAB_LIMITS.customPromptMaxChars)),
});

export const mentorBodySchema = z.object({
    messages: labMessagesSchema,
    mentorId: z.string().max(64).nullish(),
    customMentor: customMentorSchema.nullish(),
    // 归属校验在路由里做（需要查库），这里只钳形状
    sessionId: z.string().max(128).nullish(),
});

export const mbtiBodySchema = z.object({
    messages: labMessagesSchema,
    mbtiType: z.string().max(8).nullish(),
});

export const groupBodySchema = z.object({
    messages: z
        .array(groupMessageSchema)
        .min(1)
        .max(GROUP_LIMITS.maxMessages)
        .refine(
            (msgs) => msgs.reduce((sum, m) => sum + m.content.length, 0) <= GROUP_LIMITS.messagesTotalMaxChars,
            '消息总长度超限',
        ),
    mentorIds: z
        .array(z.string())
        .min(2)
        .max(4)
        .refine((ids) => ids.every((id) => !!getMentor(id)), '包含不支持的大师'),
    mode: z.enum(['discuss', 'debate']),
    topic: z.string().max(GROUP_LIMITS.topicMaxChars).nullish(),
    intent: z.enum(['discuss', 'summarize']).nullish(),
    // 续轮复用同一场圆桌：有则服务端校验归属并从 DB 回灌历史，前端只传新消息
    labSessionId: z.string().max(128).nullish(),
});
