'use server';

import { prisma } from '@/lib/db/prisma';
import { analyzeLowScoreConversations } from '@/lib/ai/optimization';

/**
 * 保存 Prompt 优化日志
 * 
 * @param result - 优化分析结果
 * @returns 保存的日志记录
 */
export async function saveOptimizationLog(result: {
    lowScoreCount: number;
    commonIssues: any;
    suggestions: string[];
    affectedPrompts: string[];
}) {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const period = `${sevenDaysAgo.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}`;

        const log = await prisma.promptOptimizationLog.create({
            data: {
                analyzedPeriod: period,
                lowScoreCount: result.lowScoreCount,
                commonIssues: result.commonIssues,
                suggestions: result.suggestions,
                affectedPrompts: result.affectedPrompts,
            },
        });

        console.log('[Optimization Log] Saved successfully:', log.id);
        return log;
    } catch (error) {
        console.error('[Optimization Log] Failed to save:', error);
        return null;
    }
}

/**
 * 运行 Prompt 优化分析
 * 
 * @param days - 分析的天数（默认 7 天）
 * @returns 优化结果和保存的日志
 */
export async function runPromptOptimization(days: number = 7) {
    try {
        console.log('[Optimization] Starting prompt optimization analysis...');

        // 1. 分析低分对话
        const result = await analyzeLowScoreConversations(days);

        // 2. 保存日志
        const log = await saveOptimizationLog(result);

        console.log('[Optimization] Completed:', {
            lowScoreCount: result.lowScoreCount,
            suggestionsCount: result.suggestions.length,
            logId: log?.id,
        });

        return { result, log };
    } catch (error) {
        console.error('[Optimization] Failed:', error);
        throw error;
    }
}

/**
 * 获取最近的优化日志
 * 
 * @param limit - 返回数量限制（默认 10）
 * @returns 优化日志列表
 */
export async function getOptimizationLogs(limit: number = 10) {
    try {
        const logs = await prisma.promptOptimizationLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return logs;
    } catch (error) {
        console.error('[Optimization] Failed to get logs:', error);
        return [];
    }
}
