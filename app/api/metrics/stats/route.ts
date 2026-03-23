/**
 * Sprint 4: 指标统计 API
 * 按日/周/模型维度聚合 Token、延迟、错误率
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { admin: isAdmin } = await checkAdmin();
    if (!isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    try {
        const metrics = await prisma.chatMetric.findMany({
            where: { createdAt: { gte: cutoff } },
            orderBy: { createdAt: 'asc' },
        });

        // 按日聚合
        const dailyMap = new Map<string, {
            date: string;
            totalTokens: number;
            totalPromptTokens: number;
            totalCompletionTokens: number;
            totalLatency: number;
            count: number;
            errorCount: number;
            latencies: number[];
        }>();

        // 按模型聚合
        const modelMap = new Map<string, {
            model: string;
            totalTokens: number;
            count: number;
            errorCount: number;
            totalLatency: number;
        }>();

        for (const m of metrics) {
            const dateStr = m.createdAt.toISOString().slice(0, 10);

            // 日聚合
            if (!dailyMap.has(dateStr)) {
                dailyMap.set(dateStr, {
                    date: dateStr,
                    totalTokens: 0,
                    totalPromptTokens: 0,
                    totalCompletionTokens: 0,
                    totalLatency: 0,
                    count: 0,
                    errorCount: 0,
                    latencies: [],
                });
            }
            const day = dailyMap.get(dateStr)!;
            day.totalTokens += m.totalTokens;
            day.totalPromptTokens += m.promptTokens;
            day.totalCompletionTokens += m.completionTokens;
            day.totalLatency += m.latencyMs;
            day.count++;
            if (m.isError) day.errorCount++;
            day.latencies.push(m.latencyMs);

            // 模型聚合
            if (!modelMap.has(m.model)) {
                modelMap.set(m.model, {
                    model: m.model,
                    totalTokens: 0,
                    count: 0,
                    errorCount: 0,
                    totalLatency: 0,
                });
            }
            const mod = modelMap.get(m.model)!;
            mod.totalTokens += m.totalTokens;
            mod.count++;
            if (m.isError) mod.errorCount++;
            mod.totalLatency += m.latencyMs;
        }

        // 计算 P95
        function p95(arr: number[]): number {
            if (arr.length === 0) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            const idx = Math.ceil(sorted.length * 0.95) - 1;
            return sorted[Math.max(0, idx)];
        }

        const daily = Array.from(dailyMap.values()).map(d => ({
            date: d.date,
            totalTokens: d.totalTokens,
            promptTokens: d.totalPromptTokens,
            completionTokens: d.totalCompletionTokens,
            avgLatencyMs: d.count > 0 ? Math.round(d.totalLatency / d.count) : 0,
            p95LatencyMs: p95(d.latencies),
            errorRate: d.count > 0 ? Math.round((d.errorCount / d.count) * 1000) / 10 : 0,
            requestCount: d.count,
        }));

        const byModel = Array.from(modelMap.values()).map(m => ({
            model: m.model,
            totalTokens: m.totalTokens,
            requestCount: m.count,
            errorCount: m.errorCount,
            errorRate: m.count > 0 ? Math.round((m.errorCount / m.count) * 1000) / 10 : 0,
            avgLatencyMs: m.count > 0 ? Math.round(m.totalLatency / m.count) : 0,
        }));

        // 总览
        const totalRequests = metrics.length;
        const totalTokens = metrics.reduce((s, m) => s + m.totalTokens, 0);
        const totalErrors = metrics.filter(m => m.isError).length;
        const allLatencies = metrics.map(m => m.latencyMs);

        return NextResponse.json({
            summary: {
                totalRequests,
                totalTokens,
                errorRate: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 1000) / 10 : 0,
                avgLatencyMs: totalRequests > 0 ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / totalRequests) : 0,
                p95LatencyMs: p95(allLatencies),
            },
            daily,
            byModel,
        });
    } catch (e: any) {
        console.error('[MetricsStats] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
