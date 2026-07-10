/**
 * 记忆提取器
 * 从对话中提取有长期价值的信息
 * 
 * 遵循Google Agent记忆能力白皮书原则：
 * 1. 使用LLM进行智能提取
 * 2. 只提取有长期价值的信息
 * 3. 在存储前进行PII脱敏
 */

import { generateStructured, type ChatMessage } from '@/lib/llm';
import { getMemoryLlmProvider } from '@/lib/llm/config';
import { MEMORY_EXTRACTION_PROMPT } from './prompts';
import { redactPII } from './redact';
import { MemoryExtractionSchema } from '@/lib/ai/schemas';
import type { ExtractedMemory, ConversationMessage } from './types';
import { logError } from '@/lib/observability/logger';

/**
 * 从对话消息中提取记忆
 * @param messages 对话消息列表
 * @returns 提取的记忆列表；LLM 调用失败返回 null（区别于"真无记忆"的 []，
 *          调用方据此决定是否推进增量水位线/留 retry 日志）
 */
export async function extractMemoriesFromMessages(
    messages: ConversationMessage[]
): Promise<ExtractedMemory[] | null> {
    // 过滤出用户消息作为分析重点
    const userMessages = messages.filter(m => m.role === 'user');

    if (userMessages.length === 0) {
        return [];
    }

    // 构建对话文本
    const conversationText = messages
        .map(m => `${m.role === 'user' ? '用户' : '咨询师'}: ${m.content}`)
        .join('\n\n');

    const extractionMessages: ChatMessage[] = [
        {
            role: 'system',
            content: MEMORY_EXTRACTION_PROMPT,
        },
        {
            role: 'user',
            content: `请分析以下对话并提取值得记住的信息：\n\n${conversationText}`,
        },
    ];

    try {
        const result = await generateStructured(extractionMessages, MemoryExtractionSchema, {
            provider: getMemoryLlmProvider(),
            temperature: 0.1, // 更低温度保证一致性
        });

        const memories = result.memories;

        // PII脱敏与清洗
        return memories.map(m => ({
            ...m,
            content: redactPII(m.content),
            confidence: Math.min(1, Math.max(0.5, m.confidence || 0.8)),
        }));
    } catch (error) {
        // 结构化记录失败，让线上限流/超时/schema 不匹配等可观测。
        // 返回 null（而非 []）让调用方能区分「失败」和「真无记忆」——
        // 增量提取失败时不能推进水位线，否则这批消息永远不会被重新分析。
        logError('memory-extraction-llm-failed', {
            error: error instanceof Error ? error.message : String(error),
            messageCount: messages.length,
            provider: getMemoryLlmProvider(),
        });
        return null;
    }
}

/**
 * 批量从多个对话中提取记忆（用于后台批处理）
 */
export async function extractMemoriesFromConversations(
    conversations: Array<{ id: string; messages: ConversationMessage[] }>
): Promise<Map<string, ExtractedMemory[]>> {
    const results = new Map<string, ExtractedMemory[]>();

    for (const conv of conversations) {
        try {
            const memories = await extractMemoriesFromMessages(conv.messages);
            results.set(conv.id, memories ?? []);
        } catch (error) {
            console.error(`[MemoryExtractor] Failed for conversation ${conv.id}:`, error);
            results.set(conv.id, []);
        }
    }

    return results;
}
