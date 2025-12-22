import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * 获取评估列表（分页）
 */
export async function GET(request: NextRequest) {
    try {
        // 验证管理员权限
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // 获取查询参数
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const skip = (page - 1) * pageSize;

        // 查询评估总数
        const total = await prisma.conversationEvaluation.count();

        // 查询评估列表
        const evaluations = await prisma.conversationEvaluation.findMany({
            skip,
            take: pageSize,
            orderBy: {
                evaluatedAt: 'desc',
            },
            include: {
                conversation: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        // 统计数据
        const lowScoreCount = await prisma.conversationEvaluation.count({
            where: {
                overallGrade: { in: ['C', 'D', 'F'] },
            },
        });

        // 待评估状态的记录数
        const evaluatingCount = await prisma.conversationEvaluation.count({
            where: {
                overallGrade: 'EVALUATING',
            },
        });

        // 已完成评估的数量
        const completedCount = total - evaluatingCount;

        // 数据库中所有会话数量
        const allConversationsCount = await prisma.conversation.count({
            where: {
                messages: {
                    some: {},
                },
            },
        });

        // 格式化响应
        const formattedEvaluations = evaluations.map((e: any) => ({
            id: e.id,
            conversationId: e.conversationId,
            conversationTitle: e.conversation.title || '未命名会话',
            evaluatedAt: e.evaluatedAt.toISOString(),

            // 总体
            overallGrade: e.overallGrade,
            overallScore: e.overallScore,

            // 各维度
            legalScore: e.legalScore,
            legalIssues: e.legalIssues,

            ethicalScore: e.ethicalScore,
            ethicalIssues: e.ethicalIssues,

            professionalScore: e.professionalScore,
            professionalIssues: e.professionalIssues,

            uxScore: e.uxScore,
            uxIssues: e.uxIssues,

            // 改进建议
            improvements: e.improvements,

            // 审核状态
            reviewStatus: e.reviewStatus,
            reviewedAt: e.reviewedAt?.toISOString(),
            reviewNote: e.reviewNote,
        }));

        return NextResponse.json({
            total,
            page,
            pageSize,
            evaluations: formattedEvaluations,
            stats: {
                allConversations: allConversationsCount,
                pending: evaluatingCount,
                completed: completedCount,
                lowScore: lowScoreCount,
            },
        });

    } catch (error) {
        console.error('[API] Get evaluations failed:', error);
        return NextResponse.json({
            error: 'Failed to get evaluations',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
