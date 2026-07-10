/**
 * Cron: 清理过期/低置信度记忆（V2 ProfileMemory）
 * 清理条件：90 天未更新 + 置信度 < 0.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteExpiredProfileMemories } from '@/lib/memory/data-bridge';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // CRON_SECRET 未配置时 'Bearer undefined' 字面量可过校验，必须 fail-closed
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90);

        const totalPruned = await deleteExpiredProfileMemories(cutoffDate, 0.5);

        return NextResponse.json({
            message: '记忆清理完成',
            totalPruned,
        });
    } catch (e: any) {
        console.error('[CronPruneMemory] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
