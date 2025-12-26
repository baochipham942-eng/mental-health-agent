/**
 * 记忆整合器
 * 处理新提取记忆与现有记忆的关系
 */

import { chatCompletion, type ChatMessage } from '@/lib/ai/deepseek';
import { MEMORY_CONSOLIDATION_PROMPT, formatMemoriesAsContext } from './prompts';
import type { Memory, ExtractedMemory, ConsolidationResult, MemoryAction } from './types';

/**
 * 整合单条新记忆与现有记忆
 */
export async function consolidateMemory(
    newMemory: ExtractedMemory,
    existingMemories: Memory[]
): Promise<ConsolidationResult> {
    if (existingMemories.length === 0) {
        return {
            action: 'create',
            reason: '无现有记忆，直接创建',
        };
    }

    const existingContext = formatMemoriesAsContext(existingMemories);
    const newMemoryContext = formatMemoriesAsContext([newMemory]);

    const prompt = MEMORY_CONSOLIDATION_PROMPT
        .replace('{existingMemories}', existingContext)
        .replace('{newMemory}', newMemoryContext);

    const messages: ChatMessage[] = [
        { role: 'system', content: prompt },
        { role: 'user', content: '请决定如何处理这条新记忆。' },
    ];

    try {
        const result = await chatCompletion(messages, {
            temperature: 0.2,
            max_tokens: 500,
        });

        return parseConsolidationResponse(result.reply, existingMemories);
    } catch (error) {
        console.error('[MemoryConsolidator] LLM consolidation failed:', error);
        return fallbackConsolidation(newMemory, existingMemories);
    }
}

function parseConsolidationResponse(
    response: string,
    existingMemories: Memory[]
): ConsolidationResult {
    try {
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
            response.match(/\{[\s\S]*"action"[\s\S]*\}/);

        let jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
        const parsed = JSON.parse(jsonStr);

        const action = parsed.action as MemoryAction;
        if (!['create', 'update', 'delete', 'skip'].includes(action)) {
            return { action: 'create', reason: '解析失败，默认创建' };
        }

        const result: ConsolidationResult = {
            action,
            reason: parsed.reason || '无理由',
        };

        if ((action === 'update' || action === 'delete') && parsed.targetMemoryId) {
            const targetExists = existingMemories.some(m => m.id === parsed.targetMemoryId);
            if (targetExists) {
                result.targetMemoryId = parsed.targetMemoryId;
            } else {
                return { action: 'create', reason: '目标记忆不存在，改为创建' };
            }
        }

        if (action === 'update' && parsed.mergedContent) {
            result.mergedContent = parsed.mergedContent;
        }

        return result;
    } catch (error) {
        console.error('[MemoryConsolidator] Parse error:', error);
        return { action: 'create', reason: '解析失败，默认创建' };
    }
}

function fallbackConsolidation(
    newMemory: ExtractedMemory,
    existingMemories: Memory[]
): ConsolidationResult {
    const newWords = new Set(newMemory.content.split(/\s+|，|。|、/));

    for (const existing of existingMemories) {
        const existingWords = new Set(existing.content.split(/\s+|，|。|、/));
        let overlap = 0;
        for (const word of newWords) {
            if (existingWords.has(word) && word.length > 1) overlap++;
        }

        const overlapRatio = overlap / Math.max(newWords.size, 1);
        if (overlapRatio > 0.5) {
            if (newMemory.content.length > existing.content.length * 1.2 ||
                newMemory.confidence > existing.confidence) {
                return {
                    action: 'update',
                    targetMemoryId: existing.id,
                    mergedContent: newMemory.content,
                    reason: '文本高度相似，更新为更详细版本',
                };
            }
            return { action: 'skip', reason: '与现有记忆高度重叠' };
        }
    }

    return { action: 'create', reason: '无明显重叠，创建新记忆' };
}

export async function consolidateMemories(
    newMemories: ExtractedMemory[],
    existingMemoriesMap: Map<string, Memory[]>
): Promise<Array<{ memory: ExtractedMemory; result: ConsolidationResult }>> {
    const results: Array<{ memory: ExtractedMemory; result: ConsolidationResult }> = [];

    for (const newMemory of newMemories) {
        const existingForTopic = existingMemoriesMap.get(newMemory.topic) || [];
        const result = await consolidateMemory(newMemory, existingForTopic);
        results.push({ memory: newMemory, result });

        if (result.action === 'create') {
            const fakeMemory: Memory = {
                id: `temp-${Date.now()}`,
                userId: '',
                topic: newMemory.topic,
                content: newMemory.content,
                entities: newMemory.entities || [],
                relationships: newMemory.relationships || [],
                confidence: newMemory.confidence,
                createdAt: new Date(),
                updatedAt: new Date(),
                accessedAt: new Date(),
                accessCount: 1,
                stabilityFactor: 1.0,
                memoryStrength: 1.0,
            };
            existingForTopic.push(fakeMemory);
            existingMemoriesMap.set(newMemory.topic, existingForTopic);
        }
    }

    return results;
}
