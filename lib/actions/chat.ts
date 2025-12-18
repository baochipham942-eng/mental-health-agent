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

    revalidatePath('/dashboard');
    redirect(`/dashboard/${conversation.id}`);
}

export async function getSessionHistory() {
    const session = await auth();
    if (!session?.user?.id) return [];

    const conversations = await prisma.conversation.findMany({
        where: {
            userId: session.user.id,
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
