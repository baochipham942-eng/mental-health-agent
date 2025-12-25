'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createNewSession() {
    console.log('--- createNewSession Called ---');
    const session = await auth();
    console.log('Session User:', session?.user?.id);
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    const conversation = await prisma.conversation.create({
        data: {
            userId: session.user.id,
            title: '新对话',
        },
    });

    revalidatePath('/');
    redirect(`/c/${conversation.id}`);
}

/**
 * 更新会话标题
 * 注意：不调用 revalidatePath，因为这会导致正在输入的用户丢失内容
 * 侧边栏列表会在页面切换或手动刷新时更新
 */
export async function updateSessionTitle(sessionId: string, title: string) {
    const session = await auth();
    if (!session?.user?.id) return;

    // 截取前30个字符作为标题
    const cleanTitle = title.trim().substring(0, 30);

    await prisma.conversation.updateMany({
        where: {
            id: sessionId,
            userId: session.user.id,
        },
        data: {
            title: cleanTitle,
        },
    });

    // ★ 移除 revalidatePath：防止用户正在输入时页面刷新
    // revalidatePath('/dashboard');
}

/**
 * 创建新会话并返回 ID（用于懒创建模式）
 * 不进行重定向，由前端处理 URL 更新
 * 注意：不调用 revalidatePath，因为这会导致正在输入的用户丢失内容
 */
export async function createNewSessionAndReturnId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    const conversation = await prisma.conversation.create({
        data: {
            userId: session.user.id,
            title: '新对话',
        },
    });

    // ★ 移除 revalidatePath：防止用户正在输入时页面刷新
    // 侧边栏会在用户导航或刷新页面时自动更新
    // revalidatePath('/dashboard');
    return conversation.id;
}

export async function getSessionHistory() {
    const session = await auth();
    if (!session?.user?.id) return [];

    const conversations = await prisma.conversation.findMany({
        where: {
            userId: session.user.id,
            isHidden: false, // 排除隐藏的会话
        },
        include: {
            _count: {
                select: { messages: true }
            }
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: 20, // Limit to 20 for sidebar
    });

    // Filter out empty conversations (no messages)
    return conversations.filter(c => c._count.messages > 0);
}

/**
 * 隐藏会话（软删除）
 * 仅从用户列表移除，不删除数据
 */
export async function hideSession(sessionId: string): Promise<void> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    await prisma.conversation.updateMany({
        where: {
            id: sessionId,
            userId: session.user.id, // 确保只能隐藏自己的会话
        },
        data: {
            isHidden: true,
        },
    });

    revalidatePath('/');
}

export async function getSessionById(sessionId: string) {
    const session = await auth();
    if (!session?.user?.id) return null;

    const conversation = await prisma.conversation.findFirst({
        where: {
            id: sessionId,
            userId: session.user.id,
        },
        include: {
            messages: {
                orderBy: {
                    createdAt: 'asc',
                },
            },
        },
    });

    return conversation;
}



/**
 * 结束会话 - 标记为 COMPLETED
 */
export async function completeSession(sessionId: string): Promise<void> {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Unauthorized');

    await prisma.conversation.updateMany({
        where: {
            id: sessionId,
            userId: session.user.id,
        },
        data: {
            status: 'COMPLETED',
        },
    });

    revalidatePath('/');
}
