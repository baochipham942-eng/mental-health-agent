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

**评估规则**：
1. 每个要素完成度 0-100%：
   - 0-30%：未提及或非常模糊
   - 31-60%：有初步了解但缺乏细节
   - 61-80%：有较清晰的理解
   - 81-100%：非常清晰，有具体例子

2. **结束评估条件**（shouldConclude = true）：
   - 总体进度 >= 70%（即大多数要素已收集）
   - 对话轮次 >= 7 轮
   - 用户明确表示想要结束或获得总结
   - 用户重复相同内容超过 3 次

3. **模式判断**：
   - assessment：用户需要评估和理解自己的问题
   - support：用户更需要情感支持和倾听

**输出格式**：
{
  "scebProgress": { "situation": 0-100, "cognition": 0-100, "emotion": 0-100, "behavior": 0-100 },
  "overallProgress": 0-100,
  "shouldConclude": true/false,
  "recommendedMode": "assessment" | "support",
  "reasoning": "简短判断理由",
  "missingElements": ["还需了解的要素列表"]
}`;

/**
 * 运行状态分类器
 * @param history 完整对话历史
 * @param options 可选配置
 */
export async function classifyDialogueState(
    history: ChatMessage[],
    options?: { traceMetadata?: Record<string, any> }
): Promise<StateClassification> {
    // 计算对话轮次（user 消息数量）
    const turnCount = history.filter(m => m.role === 'user').length;

    // 构建分析输入
    const historyText = history
        .filter(m => m.role !== 'system')
        .map(m => `[${m.role === 'user' ? '用户' : 'AI'}]: ${m.content}`)
        .join('\n');

    const messages: ChatMessage[] = [
        { role: 'system', content: STATE_CLASSIFIER_PROMPT },
        {
            role: 'user',
            content: `请分析以下对话（共 ${turnCount} 轮用户发言）：

${historyText}

请输出 JSON 格式的状态分析结果。`,
        },
    ];

    try {
        const result = await chatStructuredCompletion(messages, StateClassificationSchema, {
            temperature: 0, // 追求一致性
            traceMetadata: {
                ...options?.traceMetadata,
                agent: 'state-classifier',
                turnCount,
            },
        });

        // 硬上限保护：超过 10 轮强制结束
        if (turnCount >= 10 && !result.shouldConclude) {
            return {
                ...result,
                shouldConclude: true,
                reasoning: `${result.reasoning}（已达对话上限 ${turnCount} 轮，强制结束评估）`,
            };
        }

        return result;
    } catch (error) {
        console.error('[StateClassifier] Analysis failed:', error);
        // 降级：基于轮次的简单判断
        const shouldConclude = turnCount >= 8;
        return {
            scebProgress: {
                situation: turnCount >= 2 ? 50 : 20,
                cognition: turnCount >= 4 ? 40 : 10,
                emotion: turnCount >= 3 ? 60 : 30,
                behavior: turnCount >= 5 ? 30 : 10,
            },
            overallProgress: Math.min(100, turnCount * 10),
            shouldConclude,
            recommendedMode: 'assessment',
            reasoning: `分析失败，基于 ${turnCount} 轮的默认判断`,
            missingElements: ['无法确定'],
        };
    }
}
