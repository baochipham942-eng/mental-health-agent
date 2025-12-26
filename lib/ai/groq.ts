/**
 * Groq 快速分析器
 * 使用 Llama 3.1 8B 进行快速的安全+情绪+路由分析
 * 目标延迟: ~300ms
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const groq = createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: GROQ_API_KEY,
});

export interface QuickAnalysis {
    safety: 'crisis' | 'urgent' | 'normal';
    safetyReasoning: string; // 安全评估理由
    stateReasoning: string; // 对话状态/意图分析
    emotion: { label: string; score: number };
    route: 'crisis' | 'support' | 'assessment';
    needsValidation?: boolean; // 新增：是否需要优先进行情绪共情（EFT模式）
}

export const QUICK_ANALYSIS_PROMPT = `你是心理咨询预分析助手。快速分析用户消息，直接输出 JSON（不要任何其他文字）：

{
  "safety": "crisis" | "urgent" | "normal",
  "safetyReasoning": "实事求是地说明用户消息内容与安全等级判断，1句话",
  "stateReasoning": "简要说明用户的意图和当前对话状态，1句话",
  "emotion": { "label": "焦虑|抑郁|悲伤|愤怒|恐惧|平静|快乐", "score": 1-10 },
  "route": "crisis" | "support" | "assessment",
  "needsValidation": boolean
}

安全等级规则（必须严格遵守，不要过度解读）：
- crisis: 用户**明确表达**结束生命、自杀计划、严重自伤行为。⚠️注意：仅表达“想逃离现场”、“不想面对”、“想找个地缝钻进去”属于社交回避，是 normal 等级，绝非 crisis。
- urgent: 用户表达**活着没意思**、**想要解脱**但无具体计划。⚠️注意：仅仅表达“累”、“什么都不想做”、“觉得自己废”属于抑郁症状（normal），除非明确提及“活着没意思”或“想结束”，否则不属于 urgent。
- normal: 其他所有情况，包括焦虑发作、惊恐、失眠、情绪低落、自我否定、想逃避工作/社交等。

**重要**：务必区分“逃避情境”（如不想开会、想逃跑）与“逃离世界”。前者是 Safety=normal。除非有明确的自伤表述，否则默认 normal。

**推理规则**：
- reasoning 字段必须与 safety 字段逻辑一致。
- 严禁在 reasoning 中捏造用户未提及的“自杀计划”。
- 如果 safety=normal，reasoning 中不得出现“自杀”、“自伤”等高危词汇，以免造成误解。

路由规则：
- crisis: 仅当 safety=crisis 或 urgent 时。
- assessment: 用户明确求助，有负面情绪需深入探索
- support: 日常倾诉、正面情绪、问候、闲聊、初步建立关系

EFT共情判断 (needsValidation):
- true: 当 emotion.score >= 7 且 用户处于高唤起状态（哭诉、愤怒、绝望）时。
- false: 情绪平稳，或用户明确在询问建议/解决方案时。

只输出 JSON，不要其他内容。`;

const DEFAULT_ANALYSIS: QuickAnalysis = {
    safety: 'normal',
    safetyReasoning: 'Default fallback - no analysis performed',
    stateReasoning: 'Default fallback - no analysis performed',
    emotion: { label: '平静', score: 5 },
    route: 'support'
};

/**
 * 快速分析用户消息
 * @param message 用户消息
 * @param recentHistory 最近的对话历史（用于判断上下文）
 * @returns 分析结果
 */
export async function quickAnalyze(message: string, recentHistory: { role: string; content: string }[] = []): Promise<QuickAnalysis> {
    if (!GROQ_API_KEY) {
        console.warn('[Groq] API key not configured, using default analysis');
        return DEFAULT_ANALYSIS;
    }

    try {
        const startTime = Date.now();

        // 构建上下文 Prompt
        let systemPrompt = QUICK_ANALYSIS_PROMPT;
        if (recentHistory.length > 0) {
            const contextStr = recentHistory.map(m => `${m.role}: ${m.content}`).join('\n');
            systemPrompt += `\n\n**最近对话上下文**（用于判断用户是在回答问题还是切换话题）：\n${contextStr}`;
        }

        const { text } = await generateText({
            model: groq('llama-3.1-8b-instant'),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ],
            temperature: 0,
            maxTokens: 150,
        });

        const duration = Date.now() - startTime;
        console.log('[Groq] Quick analysis completed in', duration, 'ms');

        // 解析 JSON，移除可能的 markdown 标记
        const cleaned = text.trim().replace(/```json\n?|\n?```/g, '');
        const result = JSON.parse(cleaned) as QuickAnalysis;

        // 验证结果格式
        if (!result.safety || !result.emotion || !result.route) {
            console.warn('[Groq] Invalid response format, using default');
            return DEFAULT_ANALYSIS;
        }

        // 确保 safetyReasoning 和 stateReasoning 存在
        if (!result.safetyReasoning) {
            result.safetyReasoning = `Safety: ${result.safety}`;
        }
        if (!result.stateReasoning) {
            result.stateReasoning = `Route: ${result.route}`;
        }

        // 启发式安全守卫中间件
        try {
            const { runHeuristicSafetyCheck } = await import('../middleware/safety-guard');
            const safetyCheck = runHeuristicSafetyCheck(message, result.safety);

            if (safetyCheck.isDowngraded) {
                console.log(`[Groq] Heuristic Guard: Downgrading safety to NORMAL (${safetyCheck.reason})`);
                result.safety = 'normal';
                result.route = 'support';
                result.safetyReasoning += ` ${safetyCheck.reason}`;
            }
        } catch (e) {
            console.error('[Groq] Middleware import failed:', e);
        }

        return result;
    } catch (error) {
        console.error('[Groq] Analysis failed:', error);
        return DEFAULT_ANALYSIS;
    }
}
