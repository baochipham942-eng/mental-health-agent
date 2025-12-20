'use client';

import { IconUser, IconMindMapping, IconExport, IconExperiment } from '@arco-design/web-react/icon';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

interface UserMenuProps {
    userName?: string;
    nickname?: string;
    avatar?: string;
    onSignOut: () => void;
}

/**
 * User Menu Component
 * Refactored to use generic Tailwind CSS instead of Arco Design Dropdown
 * Features:
 * - Custom animated avatar on hover (rotates like the logo)
 * - Clean "Lab" access instead of generic settings
 */
export function UserMenu({ userName, nickname, avatar, onSignOut }: UserMenuProps) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout>();

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 150); // Small delay to prevent flickering when moving between trigger and content
    };

    const handleMenuClick = (key: string) => {
        setIsOpen(false);
        if (key === 'memory') {
            router.push('/dashboard/memory');
        } else if (key === 'lab') {
            router.push('/dashboard/lab');
        } else if (key === 'logout') {
            onSignOut();
        }
    };

    return (
        <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Trigger Button */}
            <button
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 group cursor-pointer border
                ${isOpen ? 'bg-indigo-50 border-indigo-100 shadow-sm' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}
            >
                <div className="relative flex-shrink-0">
                    <div className="w-[34px] h-[34px] rounded-full ring-2 ring-white shadow-md overflow-hidden bg-white flex items-center justify-center
                        transition-transform duration-500 ease-out group-hover:rotate-[12deg] group-hover:scale-105">
                        {avatar ? (
                            <img src={avatar} alt={nickname || userName} className="w-full h-full object-cover" />
                        ) : (
                            <IconUser style={{ fontSize: 18, color: '#94a3b8' }} />
                        )}
                    </div>
                    {/* Active trait status dot */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm"></div>
                </div>

                <div className="flex-1 text-left min-w-0">
                    <p className={`text-sm font-semibold truncate transition-colors duration-300
                        ${isOpen ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {nickname || userName || '用户'}
                    </p>
                    <p className="text-xs text-slate-400 font-normal">我的资料</p>
                </div>

                {/* Chevron */}
                <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Custom Dropdown Menu */}
            <div
                className={`absolute bottom-full left-0 w-full mb-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden transition-all duration-200 origin-bottom
                ${isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95 pointer-events-none'}`}
            >
                <div className="p-1.5 space-y-0.5">
                    <button
                        onClick={() => handleMenuClick('memory')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    >
                        <IconMindMapping className="text-purple-500 text-lg" />
                        <span>我的记忆</span>
                    </button>

                    <button
                        onClick={() => handleMenuClick('lab')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    >
                        <IconExperiment className="text-cyan-600 text-lg" />
                        <span>智慧殿堂</span>
                    </button>

                    <div className="h-px bg-gray-100 my-1 mx-2"></div>

                    <button
                        onClick={() => handleMenuClick('logout')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <IconExport className="text-lg" />
                        <span>退出登录</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

