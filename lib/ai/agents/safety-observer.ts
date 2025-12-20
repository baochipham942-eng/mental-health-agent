import { z } from 'zod';
import { chatStructuredCompletion, ChatMessage } from '../deepseek';
import { SafetyAssessmentSchema } from '../schemas';

export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;

const SAFETY_OBSERVER_PROMPT = `你是一位专业的心理安全观察员。你的唯一任务是分析用户输入，检测潜在的自伤、自杀、暴力或严重的心理危机风险。

**评估标准**：
1. **风险等级**：
   - 0: 无风险。
   - 1: 弱风险（有负面情绪但无具体念头）。
   - 2: 中等风险（有自伤念头但无具体计划）。
   - 3: 高风险（有明确计划或正在实施）。

**约束条件**：
- 只负责安全评估，不参与对话。
- 输出必须符合 JSON 格式。

**返回格式**：
{
  "reasoning": "简短的风险理由分析",
  "label": "crisis" | "urgent" | "self-care" | "normal",
  "score": (数值 0-10)
}

**规则映射**：
- 风险等级 3 -> label: crisis, score: 9-10
- 风险等级 2 -> label: urgent, score: 6-8
- 风险等级 1 -> label: self-care, score: 3-5
- 风险等级 0 -> label: normal, score: 0-2`;

/**
 * SafetyObserver: 独立的安全审核 Agent
 * 用于并行地检测用户输入的风险等级
 */
export async function runSafetyObserver(
    userMessage: string,
    history: ChatMessage[] = []
): Promise<SafetyAssessment> {
    const messages: ChatMessage[] = [
        { role: 'system', content: SAFETY_OBSERVER_PROMPT },
        ...history.slice(-3), // 只取最近 3 轮历史作为上下文，平衡性能与准确度
        { role: 'user', content: userMessage }
    ];

    try {
        const result = await chatStructuredCompletion(messages, SafetyAssessmentSchema, {
            temperature: 0, // 追求一致性
        });
        return result;
    } catch (error) {
        console.error('[SafetyObserver] Analysis failed:', error);
        // 降级：默认返回正常
        return {
            reasoning: 'Analysis failed, defaulting to normal',
            label: 'normal' as const,
            score: 0
        };
    }
}
