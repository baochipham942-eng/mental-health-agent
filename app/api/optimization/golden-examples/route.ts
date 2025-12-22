/**
 * Golden Examples Management API
 * 
 * POST - 将样本纳入 Prompt (审批)
 * GET - 获取已纳入的黄金样本列表
 * DELETE - 归档/移除黄金样本
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/optimization/golden-examples
 * 
 * 将一个点赞的消息纳入 Prompt 作为 Few-Shot Example
 * Body: { messageId: string, userMessage: string, assistantMessage: string, userReason?: string, adminNote?: string }
 */
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { messageId, conversationId, userMessage, assistantMessage, userReason, adminNote } = body;

        if (!messageId || !assistantMessage) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 检查是否已存在
        const existing = await prisma.goldenExample.findUnique({
            where: { messageId }
        });

        if (existing) {
            return NextResponse.json({ error: 'This message is already a golden example' }, { status: 409 });
        }

        // 创建黄金样本
        const example = await prisma.goldenExample.create({
            data: {
                messageId,
                conversationId: conversationId || '',
                userMessage: userMessage || '',
                assistantMessage,
                userReason,
                adminNote,
                approvedBy: session.user.id,
                status: 'ACTIVE',
            }
        });

        return NextResponse.json({ success: true, example });
    } catch (error: any) {
        console.error('[GoldenExamples API] POST failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/optimization/golden-examples
 * 
 * 获取所有 ACTIVE 状态的黄金样本
 * Query: status=ACTIVE|ARCHIVED|ALL
 */
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ACTIVE';

    try {
        const where = status === 'ALL' ? {} : { status };

        const examples = await prisma.goldenExample.findMany({
            where,
            orderBy: { approvedAt: 'desc' },
            take: 50, // 最多50个样本
        });

        return NextResponse.json({
            examples,
            total: examples.length,
        });
    } catch (error: any) {
        console.error('[GoldenExamples API] GET failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/optimization/golden-examples
 * 
 * 归档一个黄金样本 (不删除，只是设为 ARCHIVED)
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        }

        await prisma.goldenExample.update({
            where: { id },
            data: { status: 'ARCHIVED' }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[GoldenExamples API] DELETE failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
