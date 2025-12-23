'use client';

import { IconPlus } from '@arco-design/web-react/icon';
import { Logo } from '@/components/logo/Logo';
import { useRouter, usePathname } from 'next/navigation';
import { useChatStore } from '@/store/chatStore';

interface SidebarHeaderClientProps {
    createNewSessionAction?: any; // Kept optional for compatibility, but unused
}

export function SidebarHeaderClient({ createNewSessionAction }: SidebarHeaderClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { resetConversation } = useChatStore();

    const handleNewChat = (e: React.FormEvent | React.MouseEvent) => {
        e.preventDefault();

        // 清空 store 状态
        resetConversation();

        // 统一导航到首页
        // 由于 ChatShell 有 key="new-session"，从历史会话导航过来会自动重新挂载
        if (pathname !== '/') {
            router.push('/');
        }
        // 如果已经在首页，resetConversation 已经清空了消息，
        // ChatShell 会自动更新显示（无需强制刷新）
    };

    return (
        <>
            {/* Sidebar Header - Logo as a whole unit */}
            <div className="mb-6 px-1">
                <Logo />
            </div>

            <button
                onClick={handleNewChat}
                className="relative flex w-full items-center justify-center rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
                <IconPlus className="absolute left-[4.5rem]" style={{ fontSize: 14 }} />
                <span>新咨询</span>
            </button>
        </>
    );
}
