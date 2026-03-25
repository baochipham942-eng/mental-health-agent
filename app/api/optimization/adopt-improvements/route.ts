import { NextRequest, NextResponse } from 'next/server';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
import { findEvalById, updateEvalById } from '@/lib/eval/data-bridge';

export const dynamic = 'force-dynamic';

/**
 * 采纳评估改进建议
 */
export async function POST(request: NextRequest) {
    try {
        const { admin: isAdmin, session } = await checkAdmin();

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

        const evaluation = findEvalById(evaluationId);

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

        const updated = updateEvalById(evaluationId, {
            reviewStatus: 'ADOPTED',
            reviewedAt: new Date(),
            reviewedBy: session?.user?.name || 'admin',
        });

        console.log('[Adopt] Improvements adopted for evaluation:', evaluationId);

        return NextResponse.json({
            success: true,
            adoptedAt: updated?.reviewedAt?.toISOString(),
        });

    } catch (error) {
        console.error('[Adopt] Failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to adopt improvements',
        }, { status: 500 });
    }
}
