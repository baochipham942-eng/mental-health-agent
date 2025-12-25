'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useChatStore } from '@/store/chatStore';
import { Modal } from '@arco-design/web-react';
import { IconPlus, IconStop } from '@arco-design/web-react/icon';
import { completeSession } from '@/lib/actions/chat';
import { generateSummaryForSession } from '@/lib/actions/summary';
import { Logo } from '@/components/logo/Logo';

interface SidebarHeaderClientProps {
    createNewSessionAction?: any; // Kept optional for compatibility, but unused
}

export function SidebarHeaderClient({ createNewSessionAction }: SidebarHeaderClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { isConsulting, currentSessionId, resetConversation } = useChatStore();

    const handleNewChat = (e: React.FormEvent | React.MouseEvent) => {
        e.preventDefault();

        if (isConsulting && currentSessionId) {
            Modal.confirm({
                title: <div className="text-center w-full">正在咨询中</div>,
                content: <div className="text-center w-full pb-2 text-gray-500">创建新咨询将结束当前对话并保存记录。确定继续吗？</div>,
                okText: '结束并开启新咨询',
                cancelText: '取消',
                icon: <IconStop className="text-orange-500" />,
                style: { width: 320, borderRadius: 12 },
                onOk: async () => {
                    try {
                        await completeSession(currentSessionId);
                        await generateSummaryForSession(currentSessionId);
                        resetConversation();
                        router.push('/');
                    } catch (err) {
                        console.error('[SidebarHeader] Failed to end session:', err);
                        resetConversation();
                        router.push('/');
                    }
                }
            });
            return;
        }

        // 统一导航到首页
        if (pathname !== '/') {
            router.push('/');
        } else {
            // 如果已经在首页，可能需要强制重置以开始新会话
            resetConversation();
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
