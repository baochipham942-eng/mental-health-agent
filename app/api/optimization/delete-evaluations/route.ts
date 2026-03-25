import { NextRequest, NextResponse } from 'next/server';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
import { deleteEvalsByIds } from '@/lib/eval/data-bridge';

export const dynamic = 'force-dynamic';

/**
 * 删除评估记录
 */
export async function POST(request: NextRequest) {
    try {
        const { admin: isAdmin } = await checkAdmin();

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

        const deleted = deleteEvalsByIds(evaluationIds);

        return NextResponse.json({
            success: true,
            deleted,
        });

    } catch (error) {
        console.error('[Delete Evaluations] Failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to delete evaluations',
        }, { status: 500 });
    }
}
