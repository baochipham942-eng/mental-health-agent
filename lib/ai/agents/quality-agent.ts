/**
 * QualityAgent (Groq, 异步不阻塞)
 * 回复质检 — 检查回复是否匹配当前对话阶段、是否违反约束、情感基调是否合适
 */

import { BaseAgent, type AgentResult } from './base-agent';
import { generateText } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { getFastAgentConfig } from './fast-model';

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

const DEFAULT_QUALITY: QualityOutput = {
    score: 8,
    issues: [],
    suggestions: [],
};

const QUALITY_PROMPT = `你是AI心理咨询回复质检专家。快速评估回复质量，输出JSON。

检查项：
1. 回复是否匹配当前对话阶段（support不做评估，assessment不做闲聊）
2. 是否违反禁止行为（如support模式下做SCEB评估）
3. 情感基调是否匹配adaptiveMode（guardian应温柔，coach可挑战）
4. 是否有空洞安慰（"我理解你"）或过度诊断
5. 篇幅是否适中（3-5句为佳）

输出JSON（不要其他文字）:
{"score": 8, "issues": ["问题1"], "suggestions": ["建议1"]}`;

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

        const { text } = await generateText({
            model: fastConfig.provider(fastConfig.model),
            messages: [
                { role: 'system', content: this.config.systemPrompt },
                {
                    role: 'user',
                    content: `用户消息: ${input.userMessage.slice(0, 200)}
路由: ${input.routeType}
角色模式: ${input.adaptiveMode}
安全等级: ${input.safetyLevel}

AI回复: ${input.reply.slice(0, 500)}`
                }
            ],
            temperature: 0,
            maxTokens: 300,
        });

        const cleaned = text.trim().replace(/```json\n?|\n?```/g, '');
        return JSON.parse(cleaned) as QualityOutput;
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
