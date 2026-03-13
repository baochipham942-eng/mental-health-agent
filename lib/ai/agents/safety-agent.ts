/**
 * SafetyAgent (DeepSeek)
 * 深度安全评估 — 仅在 triage.safety !== 'normal' 时触发
 * 从 safety-observer.ts 重构
 */

import { BaseAgent } from './base-agent';
import { generateStructured, type ChatMessage } from '@/lib/llm';
import { getSafetyLlmProvider } from '@/lib/llm/config';
import { z } from 'zod';

export const SafetyAssessmentSchema = z.object({
    reasoning: z.string(),
    label: z.enum(['crisis', 'urgent', 'self-care', 'normal']),
    score: z.number(),
    constraints: z.array(z.string()).optional(), // 注入到 CounselorAgent 的行为约束
});

export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;

export interface SafetyInput {
    message: string;
    history: ChatMessage[];
    triageSafety: string; // triage 阶段的初步判断
}

const DEFAULT_SAFE: SafetyAssessment = {
    reasoning: 'Safety check skipped (normal)',
    label: 'normal',
    score: 0,
    constraints: [],
};

const SAFETY_PROMPT = `你是一位专业的心理安全深度评估专家。Triage 阶段已初步检测到潜在风险信号，你需要进行更深入的分析。

**评估维度**：
1. **即时风险**：是否有明确的自伤/自杀计划或正在实施？
2. **风险升级**：对比历史消息，风险是在升级还是降级？
3. **保护因素**：用户是否提到支持系统（家人、朋友、治疗师）？
4. **行为约束**：根据评估结果，列出 AI 回复应遵守的约束。

**返回 JSON**：
{
  "reasoning": "详细的风险分析（2-3句）",
  "label": "crisis" | "urgent" | "self-care" | "normal",
  "score": 0-10,
  "constraints": ["约束1", "约束2"]
}

**约束示例**：
- crisis: ["必须提供紧急热线", "不进行认知挑战", "保持简短直接", "不要离开"]
- urgent: ["温和询问安全计划", "提供热线信息", "不进行评估"]
- self-care: ["关注当下感受", "建议自我照顾活动"]`;

class SafetyAgentImpl extends BaseAgent<SafetyInput, SafetyAssessment> {
    constructor() {
        super({
            name: 'safety',
            model: 'deepseek-chat',
            systemPrompt: SAFETY_PROMPT,
            timeout: 5000,
            fallbackData: DEFAULT_SAFE,
        });
    }

    protected async execute(input: SafetyInput): Promise<SafetyAssessment> {
        const messages: ChatMessage[] = [
            { role: 'system', content: this.config.systemPrompt },
            ...input.history.slice(-5),
            { role: 'user', content: `Triage 初步判断: ${input.triageSafety}\n\n用户消息: ${input.message}` }
        ];

        return await generateStructured(messages, SafetyAssessmentSchema, {
            provider: getSafetyLlmProvider(),
            temperature: 0,
        });
    }
}

let _instance: SafetyAgentImpl | null = null;
export function getSafetyAgent(): SafetyAgentImpl {
    if (!_instance) _instance = new SafetyAgentImpl();
    return _instance;
}

export { DEFAULT_SAFE };
