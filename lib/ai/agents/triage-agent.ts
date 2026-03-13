/**
 * TriageAgent (Groq)
 * 快速分析：路由 + 情绪 + 安全 + 角色选择
 * 从 groq.ts 重构，基于 BaseAgent
 */

import { BaseAgent, type AgentResult } from './base-agent';
import { generateText } from 'ai';
import { quickCrisisKeywordCheck } from '../crisis-classifier';
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

// System prompt 保持与原 groq.ts 一致
import { QUICK_ANALYSIS_PROMPT } from '../groq';

class TriageAgentImpl extends BaseAgent<TriageInput, QuickAnalysis> {
    constructor() {
        const fastConfig = getFastAgentConfig();
        super({
            name: 'triage',
            model: fastConfig.model,
            systemPrompt: QUICK_ANALYSIS_PROMPT,
            timeout: Number(process.env.TRIAGE_TIMEOUT_MS || 1200),
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
            maxTokens: 450,
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

    // Groq 失败，尝试 DeepSeek 快速分析
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

    // 最终防线：关键词检测
    if (quickCrisisKeywordCheck(input.message)) {
        return {
            ...result,
            data: { ...CONSERVATIVE_TRIAGE, safety: 'crisis', route: 'crisis', safetyReasoning: '关键词检测命中危机信号' },
        };
    }

    return { ...result, data: CONSERVATIVE_TRIAGE };
}
