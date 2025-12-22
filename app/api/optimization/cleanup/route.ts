import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * 清理空的优化日志（lowScoreCount === 0）
 */
export async function POST(request: Request) {
    try {
        // 验证管理员权限
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        console.log('[Cleanup] Deleting empty optimization logs...');

        // 删除 lowScoreCount === 0 的记录
        const result = await prisma.promptOptimizationLog.deleteMany({
            where: {
                lowScoreCount: 0,
            },
        });

        console.log(`[Cleanup] Deleted ${result.count} empty logs`);

        return NextResponse.json({
            success: true,
            deletedCount: result.count,
        });

    } catch (error) {
        console.error('[Cleanup] Failed:', error);
        return NextResponse.json({
            error: 'Cleanup failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
