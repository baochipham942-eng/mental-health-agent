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

        // 统一导航到首页
        // ChatShell 会自动处理状态重置（通过 displayMessages 逻辑）
        // 从而避免导航前的"白屏闪烁"
        if (pathname !== '/') {
            router.push('/');
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
