/**
 * 艾宾浩斯遗忘曲线算法
 * 用于计算记忆强度衰减和间隔重复
 */

import type { Memory, MemoryTopic } from './types';

/**
 * 需要应用遗忘曲线的记忆类型
 */
export const FORGETTING_TOPICS: MemoryTopic[] = [
    'emotional_pattern',
    'coping_preference',
];

/**
 * 慢速衰减的记忆类型（半衰期90天）
 */
export const SLOW_DECAY_TOPICS: MemoryTopic[] = [
    'therapy_progress',
];

/**
 * 永久保留的记忆类型（不应用衰减）
 */
export const PERMANENT_TOPICS: MemoryTopic[] = [
    'personal_context',
    'trigger_warning',
];

/**
 * 计算记忆当前强度
 * 艾宾浩斯公式: strength = e^(-t / stabilityFactor)
 * 
 * @param memory 记忆对象
 * @param now 当前时间（用于测试可注入）
 * @returns 0-1之间的强度值
 */
export function calculateMemoryStrength(
    memory: Pick<Memory, 'topic' | 'accessedAt' | 'stabilityFactor'>,
    now: Date = new Date()
): number {
    // 永久记忆始终返回1.0
    if (PERMANENT_TOPICS.includes(memory.topic)) {
        return 1.0;
    }

    const daysSinceAccess = (now.getTime() - new Date(memory.accessedAt).getTime())
        / (1000 * 60 * 60 * 24);

    // 慢速衰减（半衰期90天）
    if (SLOW_DECAY_TOPICS.includes(memory.topic)) {
        const halfLife = 90;
        return Math.pow(0.5, daysSinceAccess / halfLife);
    }

    // 标准艾宾浩斯衰减
    const stabilityFactor = memory.stabilityFactor || 1.0;
    // 基础衰减常数（stabilityFactor=1时，约7天后强度降至~0.3）
    const decayConstant = 3.0;
    const strength = Math.exp(-daysSinceAccess / (decayConstant * stabilityFactor));

    return Math.max(0, Math.min(1, strength));
}

/**
 * 访问记忆后更新稳定性
 * 每次访问增加稳定性因子，模拟间隔重复效应
 * 
 * @param currentStability 当前稳定性因子
 * @param currentAccessCount 当前访问次数
 * @returns 更新后的值
 */
export function updateAfterAccess(
    currentStability: number,
    currentAccessCount: number
): { stabilityFactor: number; accessCount: number; memoryStrength: number } {
    // 稳定性增长因子（每次访问×1.5，但有上限）
    const growthFactor = 1.5;
    const maxStability = 30; // 最大稳定性（约90天半衰期）

    const newStability = Math.min(maxStability, currentStability * growthFactor);
    const newAccessCount = currentAccessCount + 1;

    return {
        stabilityFactor: newStability,
        accessCount: newAccessCount,
        memoryStrength: 1.0, // 刚访问后强度重置为1.0
    };
}

/**
 * 判断记忆是否应该被遗忘（清理候选）
 * 
 * @param memory 记忆对象
 * @param threshold 遗忘阈值（默认0.1）
 * @returns 是否应该遗忘
 */
export function shouldForget(
    memory: Pick<Memory, 'topic' | 'accessedAt' | 'stabilityFactor'>,
    threshold: number = 0.1
): boolean {
    // 永久记忆永不遗忘
    if (PERMANENT_TOPICS.includes(memory.topic)) {
        return false;
    }

    const strength = calculateMemoryStrength(memory);
    return strength < threshold;
}

/**
 * 批量计算记忆强度并返回排序后的结果
 * 用于检索时按强度排序
 * 
 * @param memories 记忆列表
 * @returns 带强度的记忆列表，按强度降序排列
 */
export function rankByStrength<T extends Pick<Memory, 'topic' | 'accessedAt' | 'stabilityFactor'>>(
    memories: T[]
): Array<T & { calculatedStrength: number }> {
    const now = new Date();

    return memories
        .map(memory => ({
            ...memory,
            calculatedStrength: calculateMemoryStrength(memory, now),
        }))
        .sort((a, b) => b.calculatedStrength - a.calculatedStrength);
}

/**
 * 获取需要清理的过期记忆ID列表
 * 
 * @param memories 记忆列表
 * @param threshold 遗忘阈值
 * @returns 应该删除的记忆ID列表
 */
export function getMemoriesToPrune(
    memories: Array<Pick<Memory, 'id' | 'topic' | 'accessedAt' | 'stabilityFactor'>>
): string[] {
    return memories
        .filter(memory => shouldForget(memory))
        .map(memory => memory.id);
}
