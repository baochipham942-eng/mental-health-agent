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
}

const QUICK_ANALYSIS_PROMPT = `你是心理咨询预分析助手。快速分析用户消息，直接输出 JSON（不要任何其他文字）：

{
  "safety": "crisis" | "urgent" | "normal",
  "safetyReasoning": "实事求是地说明用户消息内容与安全等级判断，1句话",
  "stateReasoning": "简要说明用户的意图和当前对话状态，1句话",
  "emotion": { "label": "焦虑|抑郁|悲伤|愤怒|恐惧|平静|快乐", "score": 1-10 },
  "route": "crisis" | "support" | "assessment"
}

安全等级规则（必须严格遵守，不要过度解读）：
- crisis: 用户**明确表达**自杀/自伤/暴力的意图或计划
- urgent: 用户**明确提及**自伤念头但无具体计划
- normal: 其他所有情况，包括失眠、压力、情绪低落等常见心理困扰

**重要**：safetyReasoning 必须基于用户实际说的内容，不要臆测或过度推断。例如：
- 用户说"晚上睡不好觉" → "用户反映睡眠问题，无安全风险" ✅
- 用户说"晚上睡不好觉" → "用户表达了自伤念头" ❌（这是错误的！）

路由规则：
- crisis: 当 safety=crisis 或 urgent
- assessment: 用户明确求助，有负面情绪需深入探索
- support: 日常倾诉、正面情绪、问候、闲聊

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

        return result;
    } catch (error) {
        console.error('[Groq] Analysis failed:', error);
        return DEFAULT_ANALYSIS;
    }
}
