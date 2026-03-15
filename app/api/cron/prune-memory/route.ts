/**
 * Cron: 清理过期/低置信度记忆（V2 ProfileMemory）
 * 清理条件：90 天未更新 + 置信度 < 0.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90);

        const result = await prisma.profileMemory.deleteMany({
            where: {
                deletedAt: null,
                updatedAt: { lt: cutoffDate },
                confidence: { lt: 0.5 },
            },
        });

        return NextResponse.json({
            message: '记忆清理完成',
            totalPruned: result.count,
        });
    } catch (e: any) {
        console.error('[CronPruneMemory] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
