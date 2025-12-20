'use client';

import { Dropdown, Menu, Divider } from '@arco-design/web-react';
import { IconUser, IconMindMapping, IconExport, IconExperiment } from '@arco-design/web-react/icon';
import { useRouter } from 'next/navigation';

interface UserMenuProps {
    userName?: string;
    nickname?: string;
    avatar?: string;
    onSignOut: () => void;
}

/**
 * User Menu Component
 * Uses ByteDance's Arco Design Framework (@arco-design/web-react)
 * Features:
 * - Arco Dropdown & Menu components
 * - Custom animated avatar trigger on hover (rotates like the logo)
 * - "Lab" (Wisdom Hall) access
 */
export function UserMenu({ userName, nickname, avatar, onSignOut }: UserMenuProps) {
    const router = useRouter();

    const handleMenuClick = (key: string) => {
        if (key === 'memory') {
            router.push('/dashboard/memory');
        } else if (key === 'lab') {
            router.push('/dashboard/lab');
        } else if (key === 'logout') {
            onSignOut();
        }
    };

    const dropdownMenu = (
        <Menu onClickMenuItem={handleMenuClick} className="min-w-[160px] select-none">
            <Menu.Item key="memory">
                <div className="flex items-center gap-2 py-1">
                    <IconMindMapping className="text-purple-500" />
                    <span>我的记忆</span>
                </div>
            </Menu.Item>
            <Menu.Item key="lab">
                <div className="flex items-center gap-2 py-1">
                    <IconExperiment className="text-cyan-600" />
                    <span>实验室</span>
                </div>
            </Menu.Item>
            <Divider style={{ margin: '4px 0' }} />
            <Menu.Item key="logout">
                <div className="flex items-center gap-2 py-1 text-red-600">
                    <IconExport />
                    <span>退出登录</span>
                </div>
            </Menu.Item>
        </Menu>
    );

    return (
        <Dropdown
            droplist={dropdownMenu}
            position="top"
            trigger="hover"
        >
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-indigo-50 transition-colors group cursor-pointer shadow-sm border border-slate-100">
                <div className="relative flex-shrink-0">
                    {/* Active trait status dot */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm z-10"></div>

                    {/* Animated Avatar Container */}
                    <div className="w-[34px] h-[34px] rounded-full ring-2 ring-white shadow-md overflow-hidden bg-white flex items-center justify-center
                        transition-transform duration-500 ease-out group-hover:rotate-[12deg] group-hover:scale-105">
                        {avatar ? (
                            <img src={avatar} alt={nickname || userName} className="w-full h-full object-cover" />
                        ) : (
                            <IconUser style={{ fontSize: 18, color: '#94a3b8' }} />
                        )}
                    </div>
                </div>

                <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-indigo-600 transition-colors">
                        {nickname || userName || '用户'}
                    </p>
                    <p className="text-xs text-slate-400 font-normal">我的资料</p>
                </div>

                <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
            </button>
        </Dropdown>
    );
}
