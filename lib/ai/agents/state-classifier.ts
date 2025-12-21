/**
 * State Classifier Agent
 * 分析对话状态，判断 SCEB 要素收集进度，决定是否应该结束评估
 */

import { z } from 'zod';
import { chatStructuredCompletion, ChatMessage } from '../deepseek';

/**
 * SCEB 进度 Schema
 */
export const SCEBProgressSchema = z.object({
    situation: z.number().min(0).max(100).describe('情境了解程度 0-100'),
    cognition: z.number().min(0).max(100).describe('认知模式了解程度 0-100'),
    emotion: z.number().min(0).max(100).describe('情绪状态了解程度 0-100'),
    behavior: z.number().min(0).max(100).describe('行为反应了解程度 0-100'),
});

/**
 * 状态分类结果 Schema
 */
export const StateClassificationSchema = z.object({
    scebProgress: SCEBProgressSchema,
    overallProgress: z.number().min(0).max(100).describe('总体评估完成度'),
    shouldConclude: z.boolean().describe('是否应该结束评估并生成总结'),
    recommendedMode: z.enum(['assessment', 'support']).describe('推荐的对话模式'),
    reasoning: z.string().describe('判断理由'),
    missingElements: z.array(z.string()).describe('还需要了解的要素'),
});

export type SCEBProgress = z.infer<typeof SCEBProgressSchema>;
export type StateClassification = z.infer<typeof StateClassificationSchema>;

const STATE_CLASSIFIER_PROMPT = `你是一位对话状态分析专家。你的任务是分析心理咨询对话的进展，判断 SCEB 要素的收集完成度。

**SCEB 要素**：
- **Situation（情境）**：用户遇到的具体情况、事件、场景
- **Cognition（认知）**：用户的想法、信念、解读方式
- **Emotion（情绪）**：用户的情感状态、感受
- **Behavior（行为）**：用户的反应、行为模式、应对方式

**输出格式**：必须返回纯 JSON，格式如下：
{
  "scebProgress": { "situation": 0-100, "cognition": 0-100, "emotion": 0-100, "behavior": 0-100 },
  "overallProgress": 0-100,
  "shouldConclude": boolean,
  "recommendedMode": "assessment" | "support",
  "reasoning": "简短分析理由",
  "missingElements": ["还需了解的要素列表"]
}

**评估规则**：
1. 总体进度 >= 70% 或对话轮次 >= 7 轮可考虑结束评估。
2. 宁可误报完成度也不要无期限延长对话。`;

/**
 * 运行状态分类器
 */
export async function classifyDialogueState(
    history: ChatMessage[],
    options?: { traceMetadata?: Record<string, any> }
): Promise<StateClassification> {
    const turnCount = history.filter(m => m.role === 'user').length;
    const historyText = history
        .filter(m => m.role !== 'system')
        .map(m => `[${m.role === 'user' ? '用户' : 'AI'}]: ${m.content}`)
        .join('\n');

    const messages: ChatMessage[] = [
        { role: 'system', content: STATE_CLASSIFIER_PROMPT },
        {
            role: 'user',
            content: `分析以下对话（第 ${turnCount} 轮）：\n\n${historyText}`,
        },
    ];

    const callAt = async (temp: number) => {
        return await chatStructuredCompletion(messages, StateClassificationSchema, {
            temperature: temp,
            traceMetadata: { ...options?.traceMetadata, agent: 'state-classifier', turnCount },
        });
    };

    try {
        let result = await callAt(0.3);

        // 硬上限保护：超过 10 轮强制结束
        if (turnCount >= 10 && !result.shouldConclude) {
            result = {
                ...result,
                shouldConclude: true,
                reasoning: `${result.reasoning}（强制终止：已达上限）`,
            };
        }

        return result;
    } catch (error) {
        console.warn('[StateClassifier] Attempt failed, retrying...', error);
        try {
            return await callAt(0.5);
        } catch (retryError) {
            console.error('[StateClassifier] All attempts failed:', retryError);
            // 降级：手动判断
            return {
                scebProgress: { situation: 50, cognition: 50, emotion: 50, behavior: 50 },
                overallProgress: 50,
                shouldConclude: turnCount >= 8,
                recommendedMode: 'assessment',
                reasoning: `降级保护：解析失败，基于轮次 ${turnCount} 判断`,
                missingElements: [],
            };
        }
    }
}
