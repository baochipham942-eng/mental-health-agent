import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/auth/admin';
import { hideSession } from '@/lib/actions/chat';
import { HomePageClient } from '@/components/layout/HomePageClient';

export const dynamic = 'force-dynamic';

/**
 * 首页 — 双栏会话列表
 * 左栏：新对话 + 快捷功能
 * 右栏：历史对话列表
 */
export default async function HomePage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    const userName = session.user.name || session.user.email?.split('@')[0] || '用户';
    const isAdmin = isAdminSession(session);

    return (
        <HomePageClient
            sessions={[]}
            hideSessionAction={hideSession}
            userName={userName}
            nickname={(session.user as any)?.nickname}
            avatar={(session.user as any)?.avatar}
            isAdmin={isAdmin}
        />
    );
}
