import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { evaluateAndSaveConversation } from '@/lib/actions/evaluation';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

/**
 * 导入最近N条会话的评估数据（异步后台执行）
 */
export async function POST(request: Request) {
    try {
        // 验证管理员权限
        const { admin: isAdmin } = await checkAdmin();

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { count = 2 } = await request.json().catch(() => ({}));

        console.log(`[Import] Importing evaluations for ${count} recent conversations...`);

        // 查询最近的会话
        const recentConversations = await prisma.conversation.findMany({
            where: {
                messages: {
                    some: {}, // 至少有1条消息
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: count,
            select: {
                id: true,
                title: true,
                createdAt: true,
                _count: {
                    select: { messages: true },
                },
            },
        });

        if (recentConversations.length === 0) {
            return NextResponse.json({
                error: 'No conversations found',
                imported: 0,
            });
        }

        console.log(`[Import] Found ${recentConversations.length} conversations, starting background evaluation...`);

        // 🚀 异步后台执行评估（不等待）
        (async () => {
            for (const conv of recentConversations) {
                try {
                    console.log(`[Import:BG] Processing ${conv.id}...`);

                    // 检查是否已有评估
                    const existing = await prisma.conversationEvaluation.findUnique({
                        where: { conversationId: conv.id },
                    });

                    if (existing) {
                        console.log(`[Import:BG] Already evaluated, skipping ${conv.id}`);
                        continue;
                    }

                    // 调用 AI 评估（这里会花时间）
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

        // 立即返回，不等待后台任务
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
