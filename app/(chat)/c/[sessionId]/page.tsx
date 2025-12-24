```typescript
import { notFound, redirect } from 'next/navigation';
import { ChatShell } from '@/components/chat/ChatShell';
import { getSessionById, getSessionMessages } from '@/lib/db/queries'; // Assume these exist
import { auth } from '@/auth';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface SessionPageProps {
    params: {
        sessionId: string;
    };
}

export const dynamic = 'force-dynamic';

/**
 * 历史会话页面 - 加载特定会话的消息
 */
export default async function SessionPage({ params }: SessionPageProps) {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    const conversation = await getSessionById(params.sessionId);

    if (!conversation) {
        notFound();
    }

    // Ensure strict isolation
    if (conversation.userId !== session.user.id) {
        return <div>Unauthorized</div>;
    }

    // Transform Prisma messages to UI messages
    const uiMessages = conversation.messages.map(msg => ({
        ...msg,
        timestamp: msg.createdAt.toISOString(),
        metadata: msg.meta || undefined,
    }));

    return (
        <ChatShell
            // key={conversation.id} // 移除 key 以复用组件状态，实现无刷新切换
            sessionId={conversation.id}
            initialMessages={uiMessages as any}
            isReadOnly={conversation.status === 'COMPLETED'}
            user={session.user}
        />
    );
}
