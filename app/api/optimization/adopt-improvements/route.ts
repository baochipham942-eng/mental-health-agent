import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * 采纳评估改进建议
 */
export async function POST(request: NextRequest) {
    try {
        // 验证管理员权限
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { evaluationId } = body as { evaluationId: string };

        if (!evaluationId) {
            return NextResponse.json({
                error: 'Missing evaluationId',
            }, { status: 400 });
        }

        // 查找评估记录
        const evaluation = await prisma.conversationEvaluation.findUnique({
            where: { id: evaluationId },
        });

        if (!evaluation) {
            return NextResponse.json({
                error: 'Evaluation not found',
            }, { status: 404 });
        }

        if (evaluation.overallGrade === 'EVALUATING') {
            return NextResponse.json({
                error: 'Cannot adopt pending evaluation',
            }, { status: 400 });
        }

        // 更新采纳状态
        const updated = await prisma.conversationEvaluation.update({
            where: { id: evaluationId },
            data: {
                reviewStatus: 'ADOPTED',
                reviewedAt: new Date(),
                reviewedBy: session?.user?.name || 'admin',
            },
        });

        console.log('[Adopt] Improvements adopted for evaluation:', evaluationId);

        return NextResponse.json({
            success: true,
            adoptedAt: updated.reviewedAt?.toISOString(),
        });

    } catch (error) {
        console.error('[Adopt] Failed:', error);
        return NextResponse.json({
            error: 'Failed to adopt improvements',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
