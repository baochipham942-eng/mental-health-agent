import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
    findAllProfileMemories,
    findProfileMemoryOwner,
    updateProfileMemoryContent,
    softDeleteProfileMemory,
} from '@/lib/memory/data-bridge';

export const dynamic = 'force-dynamic';

/**
 * GET /api/memory - 获取当前用户的所有记忆（V2 ProfileMemory）
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: '未登录' }, { status: 401 });
        }

        const userId = session.user.id;

        const memories = await findAllProfileMemories(userId);

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
        const memory = await findProfileMemoryOwner(id);

        if (!memory || memory.userId !== userId) {
            return NextResponse.json({ error: '记忆不存在或无权限' }, { status: 403 });
        }

        const updated = await updateProfileMemoryContent(id, content);

        return NextResponse.json({ memory: updated });
    } catch (error: any) {
        console.error('[API/Memory] PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/memory - 删除记忆（软删除）
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
        const memory = await findProfileMemoryOwner(id);

        if (!memory || memory.userId !== userId) {
            return NextResponse.json({ error: '记忆不存在或无权限' }, { status: 403 });
        }

        // 软删除
        await softDeleteProfileMemory(id);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API/Memory] DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
