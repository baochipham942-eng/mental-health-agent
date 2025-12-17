import { notFound, redirect } from 'next/navigation';
import { getSessionById } from '@/lib/actions/chat';
import { auth } from '@/auth';
import { ChatShell } from '@/components/chat/ChatShell';

interface ChatPageProps {
    params: {
        sessionId: string;
    };
}

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

    // Transform Prisma messages to UI messages if needed, or pass raw and let ChatShell handle
    // For now, we pass the conversation object which contains messages.

    return (
        <div className="h-full flex flex-col">
            <ChatShell
                sessionId={conversation.id}
                initialMessages={conversation.messages as any}
                isReadOnly={conversation.status === 'COMPLETED'}
            />
        </div>
    );
}
