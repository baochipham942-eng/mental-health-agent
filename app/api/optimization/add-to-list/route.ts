import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * 添加会话到评估列表（只创建记录，不评估）
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

        // 查询会话信息
        const conversations = await prisma.conversation.findMany({
            where: {
                id: { in: conversationIds },
            },
            select: {
                id: true,
                userId: true,
            },
        });

        let added = 0;

        for (const conv of conversations) {
            // 检查是否已存在
            const existing = await prisma.conversationEvaluation.findUnique({
                where: { conversationId: conv.id },
            });

            if (existing) {
                continue;
            }

            // 创建待评估记录
            await prisma.conversationEvaluation.create({
                data: {
                    conversationId: conv.id,
                    userId: conv.userId,
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
                    improvements: [],
                },
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
            error: 'Failed to add conversations',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
