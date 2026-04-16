/**
 * TriageAgent (Groq)
 * 快速分析：路由 + 情绪 + 安全 + 角色选择
 * 从 groq.ts 重构，基于 BaseAgent
 */

import { BaseAgent, type AgentResult } from './base-agent';
import { generateText } from 'ai';
import { quickCrisisCheck } from '../crisis-classifier';
import type { QuickAnalysis } from '../groq';
import { getFastAgentConfig } from './fast-model';

export interface TriageInput {
    message: string;
    recentHistory: { role: string; content: string }[];
}

const DEFAULT_TRIAGE: QuickAnalysis = {
    safety: 'normal',
    safetyReasoning: '默认模式 - 未执行智能分析',
    stateReasoning: '默认模式 - 直接进入支持性对话',
    emotion: { label: '平静', score: 5 },
    route: 'support',
    needsValidation: false,
    adaptiveMode: 'companion',
    personaReasoning: '默认模式 - 情感支持与陪伴',
    memoryCheck: '无'
};

const CONSERVATIVE_TRIAGE: QuickAnalysis = {
    ...DEFAULT_TRIAGE,
    safety: 'normal',
    safetyReasoning: '分析服务不可用，采用保守策略',
};

export const WEAK_TRIAGE_PROMPT = `你是心理对话弱 triage 助手。只输出 JSON，不要任何解释。

返回格式：
{
  "safety": "crisis" | "urgent" | "normal",
  "safetyReasoning": "一句话",
  "stateReasoning": "一句话，描述用户当前意图",
  "emotion": { "label": "未表达|压力|疲惫|情绪低落|焦虑|悲伤|愤怒|恐惧|抑郁|平静|快乐", "score": 0-10 },
  "route": "crisis" | "support" | "assessment",
  "needsValidation": boolean,
  "adaptiveMode": "guardian" | "companion" | "guide" | "coach",
  "personaReasoning": "一句话",
  "memoryCheck": "无 或 需要记录的关键词",
  "dialogueIntent": "opening" | "sharing" | "exploring" | "seeking_solutions" | "wrapping_up",
  "scene": {
    "id": "workplace_boundary" | "student_pressure" | "caregiver_burden" | "general_support",
    "role": "knowledge_worker" | "student" | "caregiver" | "unknown",
    "conflict": "一句话",
    "intent": "vent" | "sensemaking" | "prep" | "action" | "support",
    "confidence": 0-1
  }
}

规则：
- 只有明确自杀、自伤、结束生命计划才是 crisis。
- 明确“活着没意思/想解脱”但无计划可判 urgent。
- 其他默认 normal。
- route 只做粗分类；不确定时给 support。
- 普通聊天或未表达情绪时，emotion.label 用“未表达”，score 用 0。
- triage 很弱，保守、简短、不要过度推断。
- dialogueIntent 为 wrapping_up 仅当用户明确告别时使用。完成练习后的反馈（如"我完成了XX练习"）应判为 sharing，不是 wrapping_up。
- scene 是辅助字段，不确定时给 general_support，confidence 保守。`;

class TriageAgentImpl extends BaseAgent<TriageInput, QuickAnalysis> {
    constructor() {
        const fastConfig = getFastAgentConfig();
        super({
            name: 'triage',
            model: fastConfig.model,
            systemPrompt: WEAK_TRIAGE_PROMPT,
            timeout: Number(process.env.TRIAGE_TIMEOUT_MS || 2000),
            fallbackData: CONSERVATIVE_TRIAGE,
        });
    }

    protected async execute(input: TriageInput): Promise<QuickAnalysis> {
        const fastConfig = getFastAgentConfig();
        if (!fastConfig.provider) {
            console.warn(`[TriageAgent] ${fastConfig.providerName} not configured, using default`);
            return DEFAULT_TRIAGE;
        }

        let systemPrompt = this.config.systemPrompt;
        if (input.recentHistory.length > 0) {
            const contextStr = input.recentHistory.map(m => `${m.role}: ${m.content}`).join('\n');
            systemPrompt += `\n\n**最近对话上下文**：\n${contextStr}`;
        }

        const { text } = await generateText({
            model: fastConfig.provider(fastConfig.model),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: input.message }
            ],
            temperature: 0,
            maxOutputTokens: 220,
        });

        const cleaned = text.trim().replace(/```json\n?|\n?```/g, '');
        const result = JSON.parse(cleaned) as QuickAnalysis;

        if (!result.safety || !result.emotion || !result.route) {
            return DEFAULT_TRIAGE;
        }

        // 启发式安全守卫
        try {
            const { runHeuristicSafetyCheck } = await import('../../middleware/safety-guard');
            const safetyCheck = runHeuristicSafetyCheck(input.message, result.safety);
            if (safetyCheck.isDowngraded) {
                result.safety = 'normal';
                result.route = 'support';
                result.safetyReasoning += ` ${safetyCheck.reason}`;
            }
        } catch (_) {}

        return result;
    }
}

// Singleton
let _instance: TriageAgentImpl | null = null;
export function getTriageAgent(): TriageAgentImpl {
    if (!_instance) _instance = new TriageAgentImpl();
    return _instance;
}

/**
 * 带 DeepSeek 降级的 Triage 执行
 * Groq 失败 → DeepSeek → 关键词检测
 */
export async function runTriageWithFallback(input: TriageInput): Promise<AgentResult<QuickAnalysis>> {
    const agent = getTriageAgent();
    const result = await agent.run(input);

    if (result.success) return result;

    // 弱化 triage：默认不再做第二层慢模型回退，避免在后台拖长主链尾部。
    if (process.env.TRIAGE_ENABLE_DEEP_FALLBACK === '1') {
        try {
            const { chatStructuredCompletion } = await import('../deepseek');
            const { z } = await import('zod');
            type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

            const schema = z.object({
                safety: z.enum(['crisis', 'urgent', 'normal']),
                emotion: z.object({ label: z.string(), score: z.number() }),
                route: z.enum(['crisis', 'support', 'assessment']),
            });

            const messages: ChatMessage[] = [
                { role: 'system', content: '快速分析用户消息的安全等级、情绪和路由。输出JSON: {"safety":"normal","emotion":{"label":"平静","score":5},"route":"support"}' },
                { role: 'user', content: input.message }
            ];

            const dsResult = await chatStructuredCompletion(messages, schema, { temperature: 0 });
            return {
                success: true,
                data: { ...CONSERVATIVE_TRIAGE, ...dsResult },
                latency: result.latency,
                agentName: 'triage-deepseek-fallback',
                model: 'deepseek-chat',
            };
        } catch (_) {}
    }

    // 最终防线：few-shot 语义检测
    if (await quickCrisisCheck(input.message)) {
        return {
            ...result,
            data: { ...CONSERVATIVE_TRIAGE, safety: 'crisis', route: 'crisis', safetyReasoning: 'few-shot 语义检测命中危机信号' },
        };
    }

    return { ...result, data: CONSERVATIVE_TRIAGE };
}
