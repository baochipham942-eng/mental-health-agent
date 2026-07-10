import { deepseek, DEEPSEEK_MODEL } from '@/lib/ai/deepseek';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createProfileMemory } from './data-bridge';
import type { MemoryKind } from './v2-types';
import type { MemoryTopic } from './types';
import { memoryCache } from './memory-cache';
import { logError } from '@/lib/observability/logger';

// Schema for deep psychological insights
const LabInsightSchema = z.object({
    insights: z.array(z.object({
        topic: z.enum(['emotional_pattern', 'coping_preference', 'personal_context']),
        content: z.string().describe("The deep psychological insight extracted, abstracting away roleplay details."),
        confidence: z.number().min(0).max(1).describe("Confidence score, typically 0.6-0.9 for lab insights."),
        insightType: z.enum(['thinking_preference', 'trigger_topic', 'effective_intervention']).optional().default('thinking_preference').describe("洞察分类：thinking_preference(思维偏好/认知风格), trigger_topic(触发话题/敏感点), effective_intervention(有效干预/起作用的方法)"),
    })).describe("List of extracted psychological insights"),
});

const LAB_EXTRACTOR_PROMPT = `
你是一位专业的深度心理分析师。你正在阅读一段用户与AI角色（如苏格拉底、荣格、MBTI人格）的“角色扮演”对话。
你的任务是：**忽略表面的角色扮演细节，挖掘用户深层的心理模式**。

**提取原则**：
1. **忽略皮毛**：忽略用户为了配合角色扮演而说的客套话、场景设定（如“我正在雅典广场上”）。
2. **直击内核**：关注用户表达的**核心价值观、恐惧、渴望、认知扭曲**或**情感模式**。
3. **抽象化**：将具体的对话内容抽象为对 TA 心理模式的描述，但要用第二人称“你”来写。
   - 例子：用户说”我怕输，不敢去比赛”，提取为”你似乎挺怕失败的，遇到有竞争的场合会本能地想躲开”。
4. **保守原则**：如果不确定，不要提取。只提取有价值的洞察。
5. **分类**：每条洞察需标注 insightType：
   - thinking_preference: 你的思维偏好或认知风格（如”倾向二元思维”、”偏好感性决策”）
   - trigger_topic: 能触发你强烈情绪反应的话题或场景
   - effective_intervention: 在对话中对你明显起作用的方法或角度
6. **表达风格**：始终用第二人称“你”，像一个懂你的朋友在轻轻复述对你的观察——温暖、平实、口语化。
   不要用“用户”这种第三人称，也不要用“认知扭曲”“灾难化”“核心冲突”“症状”等临床或诊断式措辞。

请输出 JSON 格式的 insight 列表（content 字段用第二人称“你”书写）。
`;

/** topic -> kind 映射 */
function mapTopicToKind(topic: MemoryTopic): MemoryKind {
    switch (topic) {
        case 'coping_preference':
        case 'exercise_preference':
            return 'coping';
        case 'trigger_warning':
        case 'crisis_history':
        case 'emotional_pattern':
            return 'trigger';
        case 'communication_style':
            return 'preference';
        case 'relationship_dynamics':
            return 'relationship';
        case 'personal_context':
        case 'life_event':
        case 'core_belief':
        case 'strength_resource':
        case 'therapy_progress':
        default:
            return 'identity';
    }
}

/** kind -> priority 映射 */
function kindPriority(kind: MemoryKind): number {
    switch (kind) {
        case 'trigger': return 90;
        case 'preference': return 80;
        case 'coping': return 75;
        case 'relationship': return 65;
        case 'identity':
        default: return 60;
    }
}

export async function extractLabInsights(
    userId: string,
    messages: { role: string; content: string }[],
    contextType: 'mentor' | 'mbti',
    contextId: string
): Promise<number> {
    try {
        // Filter out system messages, only keep user and assistant exchange
        // Limit to reasonable context window (last 20 messages)
        const relevantMessages = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-20);

        if (relevantMessages.length < 2) return 0;

        const conversationText = relevantMessages
            .map(m => `${m.role === 'user' ? 'User' : 'AI_Mentor'}: ${m.content}`)
            .join('\n');

        const { object } = await generateObject({
            model: deepseek(DEEPSEEK_MODEL),
            schema: LabInsightSchema,
            prompt: `${LAB_EXTRACTOR_PROMPT}\n\n【对话内容】\n${conversationText}`,
            temperature: 0.3,
        });

        if (!object.insights || object.insights.length === 0) return 0;

        let savedCount = 0;

        // Save to DB
        // We tag these as specific topics but append logic to content if needed, 
        // or rely on the 'sourceConvId' to track origin. 
        // sourceConversationId is String? without FK, so we can put "lab_mentor_socrates" there.

        const sourceId = `lab_${contextType}_${contextId}`;

        for (const insight of object.insights) {
            // 不再把内部分类标签拼进 content —— 否则会在"我的记忆"页面把 [实验室洞察:xxx] 暴露给用户。
            // insightType 改为编码进 sourceConversationId，内部仍可追溯来源与类型。
            const finalContent = insight.content;
            const kind = mapTopicToKind(insight.topic as MemoryTopic);

            await createProfileMemory({
                userId,
                kind,
                content: finalContent,
                priority: kindPriority(kind),
                confidence: insight.confidence * 0.85, // 实验室洞察惩罚系数
                sourceConversationId: `${sourceId}#${insight.insightType}`,
            });
            savedCount++;
        }

        // 记忆写入后失效缓存
        if (savedCount > 0) {
            memoryCache.invalidate(userId);
        }

        return savedCount;

    } catch (error) {
        logError('lab-memory-extraction-failed', {
            userId,
            contextType,
            contextId,
            messageCount: messages.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return 0; // Fail safe
    }
}
