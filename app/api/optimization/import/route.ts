import { NextResponse } from 'next/server';
import { evaluateAndSaveConversation } from '@/lib/actions/evaluation';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';
import {
    findRecentConversationsWithMessages,
    findEvalByConversationId,
} from '@/lib/eval/data-bridge';

export const dynamic = 'force-dynamic';

/**
 * 导入最近N条会话的评估数据（异步后台执行）
 */
export async function POST(request: Request) {
    try {
        const { admin: isAdmin } = await checkAdmin();

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { count = 2 } = await request.json().catch(() => ({}));

        console.log(`[Import] Importing evaluations for ${count} recent conversations...`);

        const recentConversations = await findRecentConversationsWithMessages(count);

        if (recentConversations.length === 0) {
            return NextResponse.json({
                error: 'No conversations found',
                imported: 0,
            });
        }

        console.log(`[Import] Found ${recentConversations.length} conversations, starting background evaluation...`);

        // 异步后台执行评估（不等待）
        (async () => {
            for (const conv of recentConversations) {
                try {
                    console.log(`[Import:BG] Processing ${conv.id}...`);

                    const existing = findEvalByConversationId(conv.id);
                    if (existing) {
                        console.log(`[Import:BG] Already evaluated, skipping ${conv.id}`);
                        continue;
                    }

                    const evaluation = await evaluateAndSaveConversation(conv.id);
                    console.log(`[Import:BG] Completed ${conv.id}:`, evaluation ? 'success' : 'failed');
                } catch (error) {
                    console.error(`[Import:BG] Error processing ${conv.id}:`, error);
                }
            }
            console.log('[Import:BG] All background evaluations completed');
        })().catch(err => {
            console.error('[Import:BG] Background task failed:', err);
        });

        return NextResponse.json({
            success: true,
            total: recentConversations.length,
            message: `已开始为 ${recentConversations.length} 条会话生成 AI 评估，后台执行中（约需1-2分钟），请稍后刷新页面查看结果`,
            conversations: recentConversations.map(c => ({
                id: c.id,
                title: c.title,
            })),
        });

    } catch (error) {
        console.error('[Import] Failed:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Import failed',
        }, { status: 500 });
    }
}
