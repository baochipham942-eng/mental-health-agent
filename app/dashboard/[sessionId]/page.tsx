import { notFound, redirect } from 'next/navigation';
import { getSessionById } from '@/lib/actions/chat';
import { auth } from '@/auth';
import { ChatShell } from '@/components/chat/ChatShell';

interface ChatPageProps {
    params: {
        sessionId: string;
    };
}

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: ChatPageProps) {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    const conversation = await getSessionById(params.sessionId);

    if (!conversation) {
        notFound();
    }

    // Ensure strict isolation (double check, though getSessionById already does)
    if (conversation.userId !== session.user.id) {
        return <div>Unauthorized</div>;
    }

    // Transform Prisma messages to UI messages
    // Map 'meta' from DB to 'metadata' for frontend, and fix "Invalid Date" issue
    const uiMessages = conversation.messages.map(msg => ({
        ...msg,
        timestamp: msg.createdAt.toISOString(),
        metadata: msg.meta || undefined, // Load actionCards and other metadata from DB
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
