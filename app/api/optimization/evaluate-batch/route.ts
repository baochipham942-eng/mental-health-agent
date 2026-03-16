import { NextRequest, NextResponse } from 'next/server';
import { evaluateAndSaveConversation } from '@/lib/actions/evaluation';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
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
        const { admin: isAdmin } = await checkAdmin();

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

        // 查询会话信息
        const conversations = await prisma.conversation.findMany({
            where: { id: { in: conversationIds } },
            select: { id: true, title: true, userId: true },
        });

        // 批量查询已有评估（避免 N+1）
        const existingEvals = await prisma.conversationEvaluation.findMany({
            where: { conversationId: { in: conversations.map(c => c.id) } },
            select: { conversationId: true },
        });
        const existingIds = new Set(existingEvals.map(e => e.conversationId));

        // 过滤出需要新建评估的会话
        const toCreate = conversations.filter(c => !existingIds.has(c.id));

        // 批量创建评估记录（状态为 EVALUATING）
        if (toCreate.length > 0) {
            await prisma.conversationEvaluation.createMany({
                data: toCreate.map(conv => ({
                    conversationId: conv.id,
                    userId: conv.userId,
                    legalScore: 0, legalIssues: [],
                    ethicalScore: 0, ethicalIssues: [],
                    professionalScore: 0, professionalIssues: [],
                    uxScore: 0, uxIssues: [],
                    overallScore: 0, overallGrade: 'EVALUATING',
                    improvements: [],
                })),
                skipDuplicates: true,
            });
        }

        // 查回刚创建的记录（createMany 不返回记录）
        const createdEvaluations = toCreate.map(conv => ({
            conversationId: conv.id,
            conversationTitle: conv.title || '未命名会话',
            overallGrade: 'EVALUATING',
            overallScore: 0,
        }));

        // 异步后台并行执行 AI 评估（不阻塞响应）
        (async () => {
            const results = await Promise.allSettled(
                toCreate.map(conv =>
                    evaluateAndSaveConversation(conv.id).catch(async (error) => {
                        // 评估失败则更新为失败状态
                        await prisma.conversationEvaluation.update({
                            where: { conversationId: conv.id },
                            data: { overallGrade: 'FAILED' },
                        }).catch(() => {});
                        throw error;
                    })
                )
            );
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            console.log(`[Batch Evaluate:BG] Done: ${succeeded} succeeded, ${failed} failed`);
        })().catch(() => {});

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
