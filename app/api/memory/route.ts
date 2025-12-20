import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/memory - 获取当前用户的所有记忆
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const userId = session.user.id;

        const memories = await prisma.userMemory.findMany({
            where: { userId },
            orderBy: [
                { topic: 'asc' },
                { updatedAt: 'desc' },
            ],
        });

        return NextResponse.json({ memories });
    } catch (error: any) {
        console.error('[API/Memory] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/memory - 更新记忆内容
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const userId = session.user.id;
        const { id, content } = await request.json();

        if (!id || !content) {
            return NextResponse.json({ error: '缺少必需参数' }, { status: 400 });
        }

        // 验证所有权
        const memory = await prisma.userMemory.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!memory || memory.userId !== userId) {
            return NextResponse.json({ error: '记忆不存在或无权限' }, { status: 403 });
        }

        const updated = await prisma.userMemory.update({
            where: { id },
            data: {
                content,
                updatedAt: new Date(),
            },
        });

        return NextResponse.json({ memory: updated });
    } catch (error: any) {
        console.error('[API/Memory] PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/memory - 删除记忆
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const userId = session.user.id;
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: '缺少记忆ID' }, { status: 400 });
        }

        // 验证所有权
        const memory = await prisma.userMemory.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!memory || memory.userId !== userId) {
            return NextResponse.json({ error: '记忆不存在或无权限' }, { status: 403 });
        }

        await prisma.userMemory.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API/Memory] DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
