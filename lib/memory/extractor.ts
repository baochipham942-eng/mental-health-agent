/**
 * 记忆提取器
 * 从对话中提取有长期价值的信息
 * 
 * 遵循Google Agent记忆能力白皮书原则：
 * 1. 使用LLM进行智能提取
 * 2. 只提取有长期价值的信息
 * 3. 在存储前进行PII脱敏
 */

import { chatStructuredCompletion, type ChatMessage } from '@/lib/ai/deepseek';
import { MEMORY_EXTRACTION_PROMPT } from './prompts';
import { redactPII } from './redact';
import { MemoryExtractionSchema } from '@/lib/ai/schemas';
import type { ExtractedMemory, ConversationMessage } from './types';

/**
 * 从对话消息中提取记忆
 * @param messages 对话消息列表
 * @returns 提取的记忆列表
 */
export async function extractMemoriesFromMessages(
    messages: ConversationMessage[]
): Promise<ExtractedMemory[]> {
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
        const result = await chatStructuredCompletion(extractionMessages, MemoryExtractionSchema, {
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
        console.error('[MemoryExtractor] Extraction failed:', error);
        return [];
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
            results.set(conv.id, memories);
        } catch (error) {
            console.error(`[MemoryExtractor] Failed for conversation ${conv.id}:`, error);
            results.set(conv.id, []);
        }
    }

    return results;
}
