/**
 * Sprint 4: 指标采集器
 * 采集 AI 调用的 Token 用量、延迟、错误信息，写入 ChatMetric
 */

import { prisma } from '@/lib/db/prisma';
import { logEvent } from './trace-context';

export interface MetricData {
    conversationId: string;
    messageId?: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    isError?: boolean;
    errorType?: string;
}

/**
 * 记录单次 AI 调用指标
 */
export async function recordMetric(data: MetricData): Promise<void> {
    try {
        await prisma.chatMetric.create({
            data: {
                conversationId: data.conversationId,
                messageId: data.messageId || null,
                model: data.model,
                promptTokens: data.promptTokens,
                completionTokens: data.completionTokens,
                totalTokens: data.totalTokens,
                latencyMs: data.latencyMs,
                isError: data.isError || false,
                errorType: data.errorType || null,
            },
        });

        // 同步记录到 Langfuse trace
        logEvent('chat_metric', {
            model: data.model,
            totalTokens: data.totalTokens,
            latencyMs: data.latencyMs,
            isError: data.isError || false,
        });
    } catch (error) {
        // 指标采集不应阻断主流程
        console.error('[MetricsCollector] 写入失败:', error);
    }
}

/**
 * 批量记录指标（减少数据库往返）
 */
export async function recordMetrics(dataList: MetricData[]): Promise<void> {
    if (dataList.length === 0) return;

    try {
        await prisma.chatMetric.createMany({
            data: dataList.map(d => ({
                conversationId: d.conversationId,
                messageId: d.messageId || null,
                model: d.model,
                promptTokens: d.promptTokens,
                completionTokens: d.completionTokens,
                totalTokens: d.totalTokens,
                latencyMs: d.latencyMs,
                isError: d.isError || false,
                errorType: d.errorType || null,
            })),
        });
    } catch (error) {
        console.error('[MetricsCollector] 批量写入失败:', error);
    }
}
