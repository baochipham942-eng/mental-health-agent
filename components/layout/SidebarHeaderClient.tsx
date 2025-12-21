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

        // 总是先清空当前状态
        resetConversation();

        // 总是导航到 /dashboard，即使已经在那里也要触发重新加载
        // 这样可以确保 ChatShell 组件重新初始化
        if (pathname === '/dashboard') {
            // 已经在 /dashboard，使用 router.refresh() 强制重新渲染
            router.refresh();
        } else {
            // 从历史会话页面 /dashboard/xxx 导航到 /dashboard
            router.push('/dashboard');
        }
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
