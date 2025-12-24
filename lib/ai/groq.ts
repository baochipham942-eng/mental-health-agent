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
    emotion: { label: string; score: number };
    route: 'crisis' | 'support' | 'assessment';
}

const QUICK_ANALYSIS_PROMPT = `你是心理咨询预分析助手。快速分析用户消息，直接输出 JSON（不要任何其他文字）：

{
  "safety": "crisis" | "urgent" | "normal",
  "safetyReasoning": "简要说明为什么给出这个安全等级，1-2句话",
  "emotion": { "label": "焦虑|抑郁|悲伤|愤怒|恐惧|平静|快乐", "score": 1-10 },
  "route": "crisis" | "support" | "assessment"
}

安全等级规则：
- crisis: 有明确的自杀/自伤/暴力意图或计划
- urgent: 有自伤念头但无具体计划
- normal: 无风险

路由规则：
- crisis: 当 safety=crisis 或 urgent
- assessment: 用户明确求助，有负面情绪需深入探索
- support: 日常倾诉、正面情绪、问候、闲聊

只输出 JSON，不要其他内容。`;

const DEFAULT_ANALYSIS: QuickAnalysis = {
    safety: 'normal',
    safetyReasoning: 'Default fallback - no analysis performed',
    emotion: { label: '平静', score: 5 },
    route: 'support'
};

/**
 * 快速分析用户消息
 * @param message 用户消息
 * @returns 分析结果
 */
export async function quickAnalyze(message: string): Promise<QuickAnalysis> {
    if (!GROQ_API_KEY) {
        console.warn('[Groq] API key not configured, using default analysis');
        return DEFAULT_ANALYSIS;
    }

    try {
        const startTime = Date.now();

        const { text } = await generateText({
            model: groq('llama-3.1-8b-instant'),
            messages: [
                { role: 'system', content: QUICK_ANALYSIS_PROMPT },
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

        // 确保 safetyReasoning 存在
        if (!result.safetyReasoning) {
            result.safetyReasoning = `Safety: ${result.safety}`;
        }

        return result;
    } catch (error) {
        console.error('[Groq] Analysis failed:', error);
        return DEFAULT_ANALYSIS;
    }
}
