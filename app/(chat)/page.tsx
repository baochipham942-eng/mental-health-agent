import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ChatShell } from '@/components/chat/ChatShell';

export const dynamic = 'force-dynamic';

/**
 * 新咨询页面 - 空聊天界面
 */
export default async function NewChatPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    return (
        <ChatShell
            key="new-session"
            sessionId={undefined}
            initialMessages={[]}
            isReadOnly={false}
            user={session.user}
        />
    );
}
