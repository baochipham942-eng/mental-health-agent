/**
 * CounselorAgent (DeepSeek)
 * 生成咨询回复 — 统一 support/assessment/crisis 的回复生成
 * 接收 SafetyAgent 的约束并注入 system prompt
 */

import { BaseAgent } from './base-agent';
import { streamText, type ChatMessage, type LlmProviderName } from '@/lib/llm';
import { IDENTITY_PROMPT } from '../prompts';
import type { AdaptiveMode } from '../persona-manager';

export interface CounselorInput {
    message: string;
    history: ChatMessage[];
    provider?: LlmProviderName;
    systemPrompt: string;
    safetyConstraints?: string[];
    memoryContext?: string;
    adaptiveMode?: AdaptiveMode;
    onFinish?: (text: string, toolCalls?: any[]) => Promise<void>;
    traceMetadata?: Record<string, any>;
    enableTools?: boolean;
    temperature?: number;
    maxTokens?: number;
}

export interface CounselorOutput {
    streamResult: any; // Vercel AI SDK StreamResult
}

class CounselorAgentImpl extends BaseAgent<CounselorInput, CounselorOutput> {
    constructor() {
        super({
            name: 'counselor',
            model: 'deepseek-chat',
            systemPrompt: IDENTITY_PROMPT,
            timeout: 30000, // 流式回复需要更长超时
            fallbackData: null,
        });
    }

    protected async execute(input: CounselorInput): Promise<CounselorOutput> {
        let finalPrompt = input.systemPrompt;

        // 注入安全约束
        if (input.safetyConstraints && input.safetyConstraints.length > 0) {
            finalPrompt += `\n\n**安全约束（必须遵守）**：\n${input.safetyConstraints.map(c => `- ${c}`).join('\n')}`;
        }

        // 注入记忆上下文
        if (input.memoryContext) {
            finalPrompt += `\n\n${input.memoryContext}`;
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: finalPrompt },
            ...input.history.map(msg => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
            })),
            { role: 'user', content: input.message },
        ];

        const streamResult = await streamText(messages, {
            provider: input.provider,
            temperature: input.temperature ?? 0.8,
            max_tokens: input.maxTokens ?? 400,
            onFinish: input.onFinish,
            enableTools: input.enableTools ?? true,
            traceMetadata: input.traceMetadata,
        });

        return { streamResult };
    }
}

let _instance: CounselorAgentImpl | null = null;
export function getCounselorAgent(): CounselorAgentImpl {
    if (!_instance) _instance = new CounselorAgentImpl();
    return _instance;
}
