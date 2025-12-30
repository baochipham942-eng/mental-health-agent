import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * 删除评估记录
 */
export async function POST(request: NextRequest) {
    try {
        // 验证管理员权限
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo' || (session?.user as any)?.phone === '15110203706' || session?.user?.name === '15110203706';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { evaluationIds } = body as { evaluationIds: string[] };

        if (!evaluationIds || evaluationIds.length === 0) {
            return NextResponse.json({
                error: 'No evaluations specified',
            }, { status: 400 });
        }

        const result = await prisma.conversationEvaluation.deleteMany({
            where: {
                id: { in: evaluationIds },
            },
        });

        return NextResponse.json({
            success: true,
            deleted: result.count,
        });

    } catch (error) {
        console.error('[Delete Evaluations] Failed:', error);
        return NextResponse.json({
            error: 'Failed to delete evaluations',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
