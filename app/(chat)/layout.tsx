import { auth, signOut } from '@/auth';
import { getSessionHistory, createNewSession, hideSession } from '@/lib/actions/chat';
import { ensureUserProfile } from '@/lib/actions/auth';
import { UserMenuWrapper } from '@/components/layout/UserMenuWrapper';
import { SidebarListClient } from '@/components/layout/SidebarListClient';
import { SidebarMobileWrapper } from '@/components/layout/SidebarMobileWrapper';
import { SidebarHeaderClient } from '@/components/layout/SidebarHeaderClient';
import { AuthSync } from '@/components/auth/AuthSync';
import { redirect } from 'next/navigation';

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
 * 共享聊天布局 - 用于 / 和 /c/[sessionId] 路由
 * 这个布局在路由切换时保持不变，只有 children 改变
 */
export default async function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 认证检查
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    // 确保用户拥有人格特质（昵称/头像）
    await ensureUserProfile();

    const userName = session?.user?.name || session?.user?.email?.split('@')[0] || '用户';
    const isAdmin = session?.user?.name === 'demo';

    const handleSignOut = async () => {
        'use server';
        await signOut();
    };

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
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden bg-slate-50">
            <AuthSync />
            {/* 侧边栏 */}
            <SidebarMobileWrapper>
                <div className="flex h-full flex-col px-3 py-4 md:px-3">
                    <SidebarHeaderClient createNewSessionAction={createNewSession} />

                    <div className="flex grow flex-col min-h-0 space-y-2 overflow-hidden">
                        <div className="flex flex-col min-h-0 grow">
                            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-5 mb-2 px-1">
                                历史记录
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
                                <SidebarListClient
                                    sessions={formattedSessions}
                                    hideSessionAction={hideSession}
                                />
                            </div>
                        </div>

                        <div className="flex-shrink-0 mt-auto pt-3 border-t border-slate-100">
                            <UserMenuWrapper
                                userName={userName}
                                nickname={(session?.user as any)?.nickname}
                                avatar={(session?.user as any)?.avatar}
                                isAdmin={isAdmin}
                                signOutAction={handleSignOut}
                            />
                        </div>
                    </div>
                </div>
            </SidebarMobileWrapper>

            {/* 主内容区域 - children 会在路由变化时平滑替换 */}
            <div className="flex-grow md:overflow-y-auto flex flex-col min-h-0">
                <div className="h-full flex flex-col">
                    {children}
                </div>
            </div>
        </div>
    );
}
