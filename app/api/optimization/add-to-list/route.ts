import { NextRequest, NextResponse } from 'next/server';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
import {
    findConversationsByIds,
    findEvalByConversationId,
    createEval,
} from '@/lib/eval/data-bridge';

export const dynamic = 'force-dynamic';

/**
 * 添加会话到评估列表（只创建记录，不评估）
 */
export async function POST(request: NextRequest) {
    try {
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

        const conversations = await findConversationsByIds(conversationIds);

        let added = 0;

        for (const conv of conversations) {
            const existing = findEvalByConversationId(conv.id);
            if (existing) continue;

            createEval({
                conversationId: conv.id,
                userId: conv.userId,
                overallGrade: 'EVALUATING',
            });

            added++;
        }

        return NextResponse.json({
            success: true,
            added,
            total: conversationIds.length,
        });

    } catch (error) {
        console.error('[Add to List] Failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to add conversations',
        }, { status: 500 });
    }
}
