import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/auth/admin';
import { getSessionHistory, hideSession } from '@/lib/actions/chat';
import { HomePageClient } from '@/components/layout/HomePageClient';

export const dynamic = 'force-dynamic';

// Helper function to format date as relative time
function formatRelativeDate(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const inputDate = new Date(date);
    const inputDateOnly = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());

    if (inputDateOnly.getTime() === today.getTime()) {
        return '今天';
    } else if (inputDateOnly.getTime() === yesterday.getTime()) {
        return '昨天';
    } else {
        return `${inputDate.getMonth() + 1}月${inputDate.getDate()}日`;
    }
}

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

    // 获取会话列表
    const sessions = await getSessionHistory();
    const formattedSessions = sessions.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        relativeDate: formatRelativeDate(s.createdAt),
    }));

    return (
        <HomePageClient
            sessions={formattedSessions}
            hideSessionAction={hideSession}
            userName={userName}
            nickname={(session.user as any)?.nickname}
            avatar={(session.user as any)?.avatar}
            isAdmin={isAdmin}
        />
    );
}
