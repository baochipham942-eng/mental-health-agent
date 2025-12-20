/**
 * 用户反馈 API
 * 
 * POST - 提交消息反馈（点赞/点踩）
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { saveConversationAsSnapshot } from '@/lib/testing/snapshot';
import { logInfo } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/feedback - 提交消息反馈
 * 
 * Body: {
 *   messageId: string;
 *   rating: -1 | 1;
 *   reason?: string;
 *   comment?: string;
 * }
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { messageId, rating, reason, comment } = body;

        // 验证输入
        if (!messageId || ![-1, 1].includes(rating)) {
            return NextResponse.json(
                { error: 'Invalid input: messageId and rating (-1 or 1) are required' },
                { status: 400 }
            );
        }

        // 保存反馈（upsert 避免重复）
        const feedback = await prisma.messageFeedback.upsert({
            where: { messageId },
            update: { rating, reason, comment },
            create: {
                messageId,
                userId: session.user.id,
                rating,
                reason,
                comment,
            },
        });

        logInfo('user-feedback-received', {
            messageId,
            userId: session.user.id,
            rating,
            reason,
        });

        // 负面反馈自动创建快照
        if (rating === -1) {
            try {
                const message = await prisma.message.findUnique({
                    where: { id: messageId },
                    select: { conversationId: true },
                });

                if (message) {
                    await saveConversationAsSnapshot(
                        message.conversationId,
                        undefined,
                        ['negative_feedback', reason || 'unknown'],
                        'auto_negative_feedback'
                    );

                    logInfo('auto-snapshot-created', {
                        conversationId: message.conversationId,
                        trigger: 'negative_feedback',
                        reason,
                    });
                }
            } catch (snapshotError) {
                // 快照失败不影响反馈保存
                console.error('Failed to create auto snapshot:', snapshotError);
            }
        }

        return NextResponse.json({ success: true, feedback });
    } catch (error: any) {
        // 处理 Prisma 错误（如表不存在）
        if (error.code === 'P2021') {
            return NextResponse.json(
                { error: 'Feedback table not found. Please run: npx prisma db push' },
                { status: 500 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
