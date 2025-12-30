import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * 获取会话的消息记录
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { conversationId: string } }
) {
    try {
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo' || (session?.user as any)?.phone === '15110203706' || session?.user?.name === '15110203706';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { conversationId } = params;

        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                role: true,
                content: true,
                createdAt: true,
                feedback: {
                    select: {
                        rating: true,
                        reason: true,
                    }
                }
            },
        });

        return NextResponse.json({
            messages: messages.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt.toISOString(),
                feedback: m.feedback ? {
                    rating: m.feedback.rating,
                    reason: m.feedback.reason,
                } : null,
            })),
        });

    } catch (error) {
        console.error('[API] Get messages failed:', error);
        return NextResponse.json({
            error: 'Failed to get messages',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
