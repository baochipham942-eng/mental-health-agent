import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ChatShell } from '@/components/chat/ChatShell';

export const dynamic = 'force-dynamic';

/**
 * Dashboard 首页 - 直接显示空的聊天界面
 * 用户发送第一条消息时会自动创建新会话
 */
export default async function DashboardPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    return (
        <div className="h-full flex flex-col">
            <ChatShell
                sessionId={undefined}
                initialMessages={[]}
                isReadOnly={false}
            />
        </div>
    );
}
