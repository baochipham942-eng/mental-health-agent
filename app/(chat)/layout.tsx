import { auth } from '@/auth';
import { ensureUserProfile } from '@/lib/actions/auth';
import { AuthSync } from '@/components/auth/AuthSync';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * 共享聊天布局 - 用于 / 和 /c/[sessionId] 路由
 *
 * 新架构：无侧边栏
 * - / (首页): 双栏会话列表 (SessionListPage)
 * - /c/[sessionId] (聊天页): 全屏聊天 (ChatShell)
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

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-[#F7F8FA]">
            <AuthSync />
            {children}
        </div>
    );
}
