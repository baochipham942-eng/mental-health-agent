/**
 * QualityAgent (Groq, 异步不阻塞)
 * 回复质检 — 检查回复是否匹配当前对话阶段、是否违反约束、情感基调是否合适
 */

import { BaseAgent, type AgentResult } from './base-agent';
import { generateObject, generateText } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { getFastAgentConfig } from './fast-model';
import { z } from 'zod';

export interface QualityInput {
    reply: string;
    userMessage: string;
    routeType: string;
    adaptiveMode: string;
    safetyLevel: string;
    conversationId?: string;
}

export interface QualityOutput {
    score: number;         // 0-10
    issues: string[];
    suggestions: string[];
}

const PLACEHOLDER_LINE_PATTERN = /^(问题|建议)\s*\d+\s*[:：.]?$/u;

const QualityLineSchema = z.string()
    .trim()
    .min(4)
    .max(120)
    .refine((value) => !PLACEHOLDER_LINE_PATTERN.test(value), '必须返回具体问题，不得使用占位文本');

const QualityOutputSchema = z.object({
    score: z.number().min(0).max(10),
    issues: z.array(QualityLineSchema).max(3),
    suggestions: z.array(QualityLineSchema).max(3),
});

const DEFAULT_QUALITY: QualityOutput = {
    score: 8,
    issues: [],
    suggestions: [],
};

export const QUALITY_PROMPT = `你是AI心理咨询回复质检专家。快速评估回复质量，输出JSON。

检查项：
1. 回复是否匹配当前对话阶段（support不做评估，assessment不做闲聊）
2. 是否违反禁止行为（如support模式下做SCEB评估）
3. 情感基调是否匹配adaptiveMode（guardian应温柔，coach可挑战）
4. 是否有空洞安慰（"我理解你"）或过度诊断
5. 篇幅是否适中（3-5句为佳）

输出要求：
- 只返回 JSON 对象，不要附加说明
- issues / suggestions 必须是具体、可执行的中文短句
- 严禁输出“问题1”“问题2”“建议1”这类占位文本
- 如果没有明显问题，返回 issues: [] 和 suggestions: []

示例：
{"score":8,"issues":["回复偏长，第二段信息密度过高"],"suggestions":["删掉泛化安慰，保留一个追问即可"]}`;

function normalizeQualityLine(value: string): string | null {
    const normalized = value
        .trim()
        .replace(/^[\d\s\-*_.、()（）]+/, '')
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (normalized.length < 4) return null;
    if (PLACEHOLDER_LINE_PATTERN.test(normalized)) return null;
    return normalized;
}

export function normalizeQualityOutput(output: QualityOutput): QualityOutput {
    const dedupe = (items: string[]) => {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const item of items) {
            const normalized = normalizeQualityLine(item);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            result.push(normalized);
            if (result.length >= 3) break;
        }
        return result;
    };

    return {
        score: Math.max(0, Math.min(10, Math.round(output.score))),
        issues: dedupe(output.issues || []),
        suggestions: dedupe(output.suggestions || []),
    };
}

function buildQualityPrompt(input: QualityInput, systemPrompt: string): string {
    return `${systemPrompt}

用户消息: ${input.userMessage.slice(0, 200)}
路由: ${input.routeType}
角色模式: ${input.adaptiveMode}
安全等级: ${input.safetyLevel}

AI回复: ${input.reply.slice(0, 500)}`;
}

class QualityAgentImpl extends BaseAgent<QualityInput, QualityOutput> {
    constructor() {
        const fastConfig = getFastAgentConfig();
        super({
            name: 'quality',
            model: fastConfig.model,
            systemPrompt: QUALITY_PROMPT,
            timeout: 3000,
            fallbackData: DEFAULT_QUALITY,
        });
    }

    protected async execute(input: QualityInput): Promise<QualityOutput> {
        const fastConfig = getFastAgentConfig();
        if (!fastConfig.provider) return DEFAULT_QUALITY;
        const prompt = buildQualityPrompt(input, this.config.systemPrompt);

        try {
            const { object } = await generateObject({
                model: fastConfig.provider(fastConfig.model),
                schema: QualityOutputSchema,
                prompt,
                temperature: 0,
                maxOutputTokens: 220,
            });

            return normalizeQualityOutput(object);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn('[QualityAgent] Structured generation failed, falling back to JSON text:', message);

            const { text } = await generateText({
                model: fastConfig.provider(fastConfig.model),
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                maxOutputTokens: 220,
            });

            const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
            const jsonStart = cleaned.indexOf('{');
            const jsonEnd = cleaned.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
                return DEFAULT_QUALITY;
            }

            const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
            const validated = QualityOutputSchema.parse(parsed);
            return normalizeQualityOutput(validated);
        }
    }
}

let _instance: QualityAgentImpl | null = null;
export function getQualityAgent(): QualityAgentImpl {
    if (!_instance) _instance = new QualityAgentImpl();
    return _instance;
}

/**
 * 异步运行质检（不阻塞主流程）
 * 结果写入 AgentLog
 */
export function runQualityCheckAsync(input: QualityInput): void {
    const agent = getQualityAgent();
    agent.run(input).then(async (result: AgentResult<QualityOutput>) => {
        try {
            await prisma.agentLog.create({
                data: {
                    conversationId: input.conversationId,
                    agentName: 'quality',
                    model: result.model,
                    input: {
                        userMessage: input.userMessage.slice(0, 200),
                        routeType: input.routeType,
                        adaptiveMode: input.adaptiveMode,
                    },
                    output: result.data as any,
                    latency: result.latency,
                    status: result.success ? 'success' : 'error',
                    error: result.error,
                },
            });
        } catch (e) {
            console.error('[QualityAgent] Failed to log:', e);
        }
    }).catch(e => console.error('[QualityAgent] Async check failed:', e));
}
