/**
 * Cron: 清理过期/低置信度记忆
 * 定期修剪遗忘曲线衰减后的陈旧记忆
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { memoryManager } from '@/lib/memory';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 获取所有有记忆的用户
        const usersWithMemories = await prisma.userMemory.groupBy({
            by: ['userId'],
        });

        let totalPruned = 0;

        for (const { userId } of usersWithMemories) {
            const pruned = await memoryManager.pruneStaleMemories(userId, {
                maxAge: 90,
                minConfidence: 0.5,
            });
            totalPruned += pruned;
        }

        return NextResponse.json({
            message: 'Memory prune complete',
            usersProcessed: usersWithMemories.length,
            totalPruned,
        });
    } catch (e: any) {
        console.error('[CronPruneMemory] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
