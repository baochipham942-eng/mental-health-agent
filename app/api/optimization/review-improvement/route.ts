import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { applyImprovements, revokeImprovements } from '@/lib/ai/optimization';

export const dynamic = 'force-dynamic';

type ReviewAction = 'adopt' | 'reject' | 'revoke';

/**
 * 审核评估改进建议
 * action: adopt(采纳) - 自动修改 prompt
 *         reject(驳回) - 仅更新状态
 *         revoke(撤回) - 恢复原始 prompt
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo' || (session?.user as any)?.phone === '15110203706' || session?.user?.name === '15110203706';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { evaluationId, action, note } = body as {
            evaluationId: string;
            action: ReviewAction;
            note?: string;
        };

        if (!evaluationId || !action) {
            return NextResponse.json({
                error: 'Missing evaluationId or action',
            }, { status: 400 });
        }

        if (!['adopt', 'reject', 'revoke'].includes(action)) {
            return NextResponse.json({
                error: 'Invalid action. Must be: adopt, reject, or revoke',
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
                error: 'Cannot review pending evaluation',
            }, { status: 400 });
        }

        // 根据 action 执行对应操作
        let newStatus: string;
        let updateData: Record<string, unknown>;
        let promptModified = false;

        switch (action) {
            case 'adopt': {
                // 自动修改 prompt 文件
                const improvements = evaluation.improvements as string[] || [];
                if (improvements.length > 0) {
                    const result = applyImprovements(evaluationId, improvements);
                    if (!result.success) {
                        return NextResponse.json({
                            error: `Failed to apply improvements: ${result.error}`,
                        }, { status: 500 });
                    }
                    promptModified = true;
                }

                newStatus = 'ADOPTED';
                updateData = {
                    reviewStatus: newStatus,
                    reviewedAt: new Date(),
                    reviewedBy: session?.user?.name || 'admin',
                    reviewNote: null,
                };
                break;
            }

            case 'reject':
                newStatus = 'REJECTED';
                updateData = {
                    reviewStatus: newStatus,
                    reviewedAt: new Date(),
                    reviewedBy: session?.user?.name || 'admin',
                    reviewNote: note || null,
                };
                break;

            case 'revoke': {
                // 撤回 = 恢复原始 prompt + 重置状态
                const result = revokeImprovements(evaluationId);
                if (!result.success) {
                    return NextResponse.json({
                        error: `Failed to revoke improvements: ${result.error}`,
                    }, { status: 500 });
                }

                newStatus = 'PENDING';
                updateData = {
                    reviewStatus: newStatus,
                    reviewedAt: null,
                    reviewedBy: null,
                    reviewNote: null,
                };
                promptModified = true;
                break;
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const updated = await prisma.conversationEvaluation.update({
            where: { id: evaluationId },
            data: updateData,
        });

        console.log(`[Review] Evaluation ${evaluationId} ${action}ed by ${session?.user?.name}, promptModified: ${promptModified}`);

        return NextResponse.json({
            success: true,
            reviewStatus: updated.reviewStatus,
            reviewedAt: updated.reviewedAt?.toISOString(),
            promptModified,
        });

    } catch (error) {
        console.error('[Review] Failed:', error);
        return NextResponse.json({
            error: 'Failed to review evaluation',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
