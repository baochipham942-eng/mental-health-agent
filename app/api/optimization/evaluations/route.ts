import { NextRequest, NextResponse } from 'next/server';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
import {
    countEvals,
    countEvalsByGrades,
    findEvalsPaginated,
    getConversationTitles,
    countConversationsWithMessages,
} from '@/lib/eval/data-bridge';

export const dynamic = 'force-dynamic';

/**
 * 获取评估列表（分页）
 */
export async function GET(request: NextRequest) {
    try {
        const { admin: isAdmin } = await checkAdmin();

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');
        const skip = (page - 1) * pageSize;

        // SQLite 查询
        const total = countEvals();
        const evaluations = findEvalsPaginated(skip, pageSize);
        const lowScoreCount = countEvalsByGrades(['C', 'D', 'F']);
        const evaluatingCount = countEvalsByGrades(['EVALUATING']);
        const completedCount = total - evaluatingCount;

        // 跨库：批量获取对话标题
        const convIds = evaluations.map(e => e.conversationId);
        const titleMap = await getConversationTitles(convIds);

        // PG 查询
        const allConversationsCount = await countConversationsWithMessages();

        const formattedEvaluations = evaluations.map(e => ({
            id: e.id,
            conversationId: e.conversationId,
            conversationTitle: titleMap.get(e.conversationId) || '未命名会话',
            evaluatedAt: e.evaluatedAt.toISOString(),
            overallGrade: e.overallGrade,
            overallScore: e.overallScore,
            legalScore: e.legalScore,
            legalIssues: e.legalIssues,
            ethicalScore: e.ethicalScore,
            ethicalIssues: e.ethicalIssues,
            professionalScore: e.professionalScore,
            professionalIssues: e.professionalIssues,
            uxScore: e.uxScore,
            uxIssues: e.uxIssues,
            improvements: e.improvements,
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
            error: error instanceof Error ? error.message : 'Failed to get evaluations',
        }, { status: 500 });
    }
}
