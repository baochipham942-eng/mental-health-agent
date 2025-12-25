import { notFound, redirect } from 'next/navigation';
import { ChatShell } from '@/components/chat/ChatShell';
import { getSessionById } from '@/lib/actions/chat';
import { auth } from '@/auth';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

const SESSION_DURATION_SECONDS = 45 * 60; // 45 minutes

interface SessionPageProps {
    params: {
        sessionId: string;
    };
}

/**
 * 历史会话页面 - 加载特定会话的消息
 * 
 * 服务端计算剩余时间和是否超时，确保刷新页面时状态正确
 */
export default async function SessionPage({ params }: SessionPageProps) {
    console.log('[SessionPage] Loading session:', params.sessionId);

    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    const conversation = await getSessionById(params.sessionId);
    console.log('[SessionPage] Conversation loaded:', {
        found: !!conversation,
        msgCount: conversation?.messages?.length || 0
    });

    if (!conversation) {
        notFound();
    }

    // Ensure strict isolation
    if (conversation.userId !== session.user.id) {
        return <div>Unauthorized</div>;
    }

    // ★ 服务端计算剩余时间
    const createdAt = conversation.createdAt.getTime();
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - createdAt) / 1000);
    const timeRemaining = Math.max(0, SESSION_DURATION_SECONDS - elapsedSeconds);

    // ★ 判断是否超时（服务端权威）
    const isExpiredByTime = timeRemaining <= 0;
    const isCompleted = conversation.status === 'COMPLETED' || isExpiredByTime;

    console.log('[SessionPage] Session timing:', {
        createdAt: conversation.createdAt.toISOString(),
        elapsedSeconds,
        timeRemaining,
        isExpiredByTime,
        isCompleted
    });

    // Transform Prisma messages to UI messages
    const uiMessages = conversation.messages.map(msg => ({
        ...msg,
        timestamp: msg.createdAt.toISOString(),
        metadata: msg.meta || undefined,
    }));

    return (
        <ChatShell
            key={conversation.id}
            sessionId={conversation.id}
            initialMessages={uiMessages as any}
            isReadOnly={isCompleted}
            initialTimeRemaining={isCompleted ? 0 : timeRemaining}
            user={session.user}
        />
    );
}
