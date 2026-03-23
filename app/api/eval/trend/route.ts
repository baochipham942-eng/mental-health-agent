/**
 * 评分趋势 API
 * 按日聚合 ConversationEvaluation 的 overallGrade 分布
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
        const evaluations = await prisma.conversationEvaluation.findMany({
            where: {
                evaluatedAt: { gte: cutoff },
                overallGrade: { notIn: ['EVALUATING', 'FAILED'] },
            },
            select: {
                evaluatedAt: true,
                overallGrade: true,
                overallScore: true,
                evalSource: true,
            },
            orderBy: { evaluatedAt: 'asc' },
        });

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
            const dateStr = ev.evaluatedAt.toISOString().slice(0, 10);
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

        // 最近低分对话
        const lowScoreConversations = await prisma.conversationEvaluation.findMany({
            where: {
                evaluatedAt: { gte: cutoff },
                overallScore: { lt: 6 },
                overallGrade: { notIn: ['EVALUATING', 'FAILED'] },
            },
            select: {
                id: true,
                conversationId: true,
                overallGrade: true,
                overallScore: true,
                evaluatedAt: true,
                evalSource: true,
                conversation: {
                    select: { title: true },
                },
            },
            orderBy: { overallScore: 'asc' },
            take: 20,
        });

        return NextResponse.json({
            trend,
            lowScoreConversations: lowScoreConversations.map(e => ({
                id: e.id,
                conversationId: e.conversationId,
                title: e.conversation.title || '未命名',
                grade: e.overallGrade,
                score: e.overallScore,
                evaluatedAt: e.evaluatedAt.toISOString(),
                source: e.evalSource,
            })),
        });
    } catch (e: any) {
        console.error('[EvalTrend] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
