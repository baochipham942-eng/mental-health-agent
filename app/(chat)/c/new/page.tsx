import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ChatShell } from '@/components/chat/ChatShell';

export const dynamic = 'force-dynamic';

/**
 * 新对话页面 — 无需预创建 session，发送第一条消息时懒创建
 */
export default async function NewChatPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    return (
        <ChatShell
            initialMessages={[]}
            user={session.user}
        />
    );
}
