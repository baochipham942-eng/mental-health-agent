/**
 * 评分趋势 API
 * 按日聚合 ConversationEvaluation 的 overallGrade 分布
 */

import { NextRequest, NextResponse } from 'next/server';
import { findEvaluationsForTrend, findRecentEvaluations } from '@/lib/eval/data-bridge';
import { requireEvalAuth } from '../auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const denied = await requireEvalAuth(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    try {
        const evaluations = findEvaluationsForTrend(cutoff);

        // 按日聚合
        const dailyMap = new Map<string, {
            date: string;
            passCount: number;
            warnCount: number;
            failCount: number;
            totalScore: number;
            count: number;
            autoCount: number;
            manualCount: number;
        }>();

        for (const ev of evaluations) {
            const dateStr = ev.evaluatedAt!.toISOString().slice(0, 10);
            if (!dailyMap.has(dateStr)) {
                dailyMap.set(dateStr, {
                    date: dateStr,
                    passCount: 0,
                    warnCount: 0,
                    failCount: 0,
                    totalScore: 0,
                    count: 0,
                    autoCount: 0,
                    manualCount: 0,
                });
            }
            const day = dailyMap.get(dateStr)!;
            day.count++;
            day.totalScore += ev.overallScore;

            // A/B 为 pass, C 为 warn, D/F 为 fail
            if (ev.overallGrade === 'A' || ev.overallGrade === 'B') {
                day.passCount++;
            } else if (ev.overallGrade === 'C') {
                day.warnCount++;
            } else {
                day.failCount++;
            }

            if (ev.evalSource === 'auto_cron' || ev.evalSource === 'auto_realtime') {
                day.autoCount++;
            } else {
                day.manualCount++;
            }
        }

        const trend = Array.from(dailyMap.values()).map(d => ({
            date: d.date,
            passCount: d.passCount,
            warnCount: d.warnCount,
            failCount: d.failCount,
            avgScore: d.count > 0 ? Math.round((d.totalScore / d.count) * 10) / 10 : 0,
            total: d.count,
            autoCount: d.autoCount,
            manualCount: d.manualCount,
        }));

        // 最近全部评估（按时间倒序，最多 50 条）
        const recentEvaluations = await findRecentEvaluations(cutoff, 50);

        const mapEval = (e: typeof recentEvaluations[0]) => ({
            id: e.id,
            conversationId: e.conversationId,
            title: e.conversationTitle || '未命名',
            grade: e.overallGrade,
            score: e.overallScore,
            evaluatedAt: e.evaluatedAt.toISOString(),
            source: e.evalSource,
        });

        return NextResponse.json({
            trend,
            recentEvaluations: recentEvaluations.map(mapEval),
            lowScoreConversations: recentEvaluations
                .filter(e => e.overallScore < 6)
                .sort((a, b) => a.overallScore - b.overallScore)
                .slice(0, 20)
                .map(mapEval),
        });
    } catch (e: any) {
        console.error('[EvalTrend] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
