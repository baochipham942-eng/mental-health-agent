
import { auth, signOut } from '@/auth';
import { getSessionHistory, createNewSession, hideSession } from '@/lib/actions/chat';
import { authenticate, ensureUserProfile } from '@/lib/actions/auth';
import { UserMenuWrapper } from '@/components/layout/UserMenuWrapper';
import { SidebarListClient } from '@/components/layout/SidebarListClient';
import { SidebarHeaderClient } from '@/components/layout/SidebarHeaderClient';

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

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 确保用户拥有人格特质（昵称/头像）
    await ensureUserProfile();

    const session = await auth();
    const userName = session?.user?.name || session?.user?.email?.split('@')[0] || '用户';

    // 创建一个 server action 用于登出
    const handleSignOut = async () => {
        'use server';
        await signOut();
    };

    // 获取会话列表并转换格式
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
            <div className="w-full flex-none md:w-64 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.03)] z-10 relative">
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

                        {/* 用户菜单（整合记忆 + 退出登录） */}
                        <div className="flex-shrink-0 mt-auto pt-3 border-t border-slate-100">
                            <UserMenuWrapper
                                userName={userName}
                                nickname={(session?.user as any)?.nickname}
                                avatar={(session?.user as any)?.avatar}
                                signOutAction={handleSignOut}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-grow md:overflow-hidden">{children}</div>
        </div>
    );
}
