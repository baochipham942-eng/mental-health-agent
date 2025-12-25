import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ChatShell } from '@/components/chat/ChatShell';

export const dynamic = 'force-dynamic';

/**
 * 新咨询页面 - 空聊天界面
 * 
 * Note: Using Date.now() in the key ensures a fresh remount each time
 * this page is visited, preventing stale state from previous sessions.
 */
export default async function NewChatPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    // Generate a unique key for each page visit to force remount
    const pageKey = `new-session-${Date.now()}`;

    return (
        <ChatShell
            key={pageKey}
            sessionId={undefined}
            initialMessages={[]}
            isReadOnly={false}
            user={session.user}
        />
    );
}
