import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * 获取待评估的会话列表
 */
export async function GET(request: NextRequest) {
    try {
        // 验证管理员权限
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // 获取限制参数
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '10');

        // 查询所有会话
        const allConversations = await prisma.conversation.findMany({
            where: {
                messages: {
                    some: {}, // 至少有1条消息
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: limit * 2, // 拿多一些，过滤后可能不够
            select: {
                id: true,
                title: true,
                createdAt: true,
                _count: {
                    select: { messages: true },
                },
                evaluation: {
                    select: { id: true },
                },
            },
        });

        // 过滤出未评估的会话
        const pendingConversations = allConversations
            .filter(c => !c.evaluation) // 修改为检查单个evaluation
            .slice(0, limit)
            .map(c => ({
                id: c.id,
                title: c.title || '未命名会话',
                createdAt: c.createdAt.toISOString(),
                messageCount: c._count.messages,
                hasEvaluation: false,
            }));

        return NextResponse.json({
            total: pendingConversations.length,
            conversations: pendingConversations,
        });

    } catch (error) {
        console.error('[API] Get pending conversations failed:', error);
        return NextResponse.json({
            error: 'Failed to get pending conversations',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
