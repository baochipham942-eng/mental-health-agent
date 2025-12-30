import { NextRequest, NextResponse } from 'next/server';
import { evaluateAndSaveConversation } from '@/lib/actions/evaluation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * 批量评估会话（异步后台执行）
 * 1. 立即创建数据库记录（状态为EVALUATING）
 * 2. 后台异步执行真实评估
 * 3. 评估完成后更新数据库记录
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
        const { conversationIds } = body as { conversationIds: string[] };

        if (!conversationIds || conversationIds.length === 0) {
            return NextResponse.json({
                error: 'No conversations specified',
            }, { status: 400 });
        }

        console.log(`[Batch Evaluate] Starting batch evaluation for ${conversationIds.length} conversations...`);

        // 查询会话信息
        const conversations = await prisma.conversation.findMany({
            where: {
                id: { in: conversationIds },
            },
            select: {
                id: true,
                title: true,
                userId: true,
            },
        });

        // ✅ 立即创建数据库记录（状态为EVALUATING）
        const createdEvaluations = [];
        for (const conv of conversations) {
            // 检查是否已有评估
            const existing = await prisma.conversationEvaluation.findUnique({
                where: { conversationId: conv.id },
            });

            if (existing) {
                console.log(`[Batch Evaluate] Evaluation already exists for ${conv.id}, skipping`);
                continue;
            }

            // 创建评估记录（初始状态）
            const evaluation = await prisma.conversationEvaluation.create({
                data: {
                    conversationId: conv.id,
                    userId: conv.userId,

                    // 临时的占位数据（评估中状态）
                    legalScore: 0,
                    legalIssues: [],

                    ethicalScore: 0,
                    ethicalIssues: [],

                    professionalScore: 0,
                    professionalIssues: [],

                    uxScore: 0,
                    uxIssues: [],

                    overallScore: 0,
                    overallGrade: 'EVALUATING',

                    // 改进建议（必需字段）
                    improvements: [],
                },
            });

            createdEvaluations.push({
                id: evaluation.id,
                conversationId: conv.id,
                conversationTitle: conv.title || '未命名会话',
                evaluatedAt: evaluation.evaluatedAt.toISOString(),
                overallGrade: 'EVALUATING',
                overallScore: 0,
                legalScore: 0,
                legalIssues: [],
                ethicalScore: 0,
                ethicalIssues: [],
                professionalScore: 0,
                professionalIssues: [],
                uxScore: 0,
                uxIssues: [],
            });
        }

        // 🚀 异步后台执行评估并更新数据库（不等待）
        (async () => {
            for (const conv of conversations) {
                try {
                    console.log(`[Batch Evaluate:BG] Processing ${conv.id}...`);

                    // 调用AI评估（这会重新创建/更新记录）
                    const evaluation = await evaluateAndSaveConversation(conv.id);
                    console.log(`[Batch Evaluate:BG] Completed ${conv.id}:`, evaluation ? 'success' : 'failed');
                } catch (error) {
                    console.error(`[Batch Evaluate:BG] Error processing ${conv.id}:`, error);

                    // 如果评估失败，更新为失败状态
                    try {
                        await prisma.conversationEvaluation.update({
                            where: { conversationId: conv.id },
                            data: {
                                overallGrade: 'FAILED',
                            },
                        });
                    } catch (updateError) {
                        console.error(`[Batch Evaluate:BG] Failed to update error status for ${conv.id}`);
                    }
                }
            }
            console.log('[Batch Evaluate:BG] All background evaluations completed');
        })().catch(err => {
            console.error('[Batch Evaluate:BG] Background task failed:', err);
        });

        // 立即返回已创建的数据库记录
        return NextResponse.json({
            success: true,
            total: createdEvaluations.length,
            message: `已开始评估 ${createdEvaluations.length} 条会话，请等待1-2分钟后刷新页面查看结果`,
            conversations: createdEvaluations,
        });

    } catch (error) {
        console.error('[Batch Evaluate] Failed:', error);
        return NextResponse.json({
            error: 'Batch evaluation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
