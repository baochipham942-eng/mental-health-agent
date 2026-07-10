import { notFound, redirect } from 'next/navigation';
import { getSessionById } from '@/lib/actions/chat';
import { auth } from '@/auth';
import { isAdminSession } from '@/lib/auth/admin';
import { sanitizeMessageMetaForUser } from '@/app/api/chat/response-visibility';
import { ChatShell } from '@/components/chat/ChatShell';

interface ChatPageProps {
    params: Promise<{
        sessionId: string;
    }>;
}

export const dynamic = 'force-dynamic';

export default async function ChatPage(props: ChatPageProps) {
    const params = await props.params;
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    const conversation = await getSessionById(params.sessionId, session.user.id);

    if (!conversation) {
        notFound();
    }

    // Ensure strict isolation (double check, though getSessionById already does)
    if (conversation.userId !== session.user.id) {
        return <div>Unauthorized</div>;
    }

    // Transform Prisma messages to UI messages（普通用户剥掉内部分析 meta）
    // Map 'meta' from DB to 'metadata' for frontend, and fix "Invalid Date" issue
    const isAdminUser = isAdminSession(session);
    const uiMessages = conversation.messages.map(msg => ({
        ...msg,
        timestamp: msg.createdAt.toISOString(),
        metadata: (isAdminUser ? msg.meta : sanitizeMessageMetaForUser(msg.meta)) || undefined,
    }));

    return (
        <div className="h-full flex flex-col">
            <ChatShell
                key={conversation.id}
                sessionId={conversation.id}
                initialMessages={uiMessages as any}
                isReadOnly={conversation.status === 'COMPLETED'}
                user={session.user}
            />
        </div>
    );
}
