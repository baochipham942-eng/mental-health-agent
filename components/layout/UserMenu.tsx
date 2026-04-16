'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Drawer } from '@arco-design/web-react';
import { IconUser, IconMindMapping, IconExport, IconExperiment, IconEdit, IconArrowRise } from '@arco-design/web-react/icon';
import { useRouter } from 'next/navigation';

interface UserMenuProps {
    userName?: string;
    nickname?: string;
    avatar?: string;
    isAdmin?: boolean;
    onSignOut: () => void;
    onEditProfile?: () => void;
}

export function UserMenu({ userName, nickname, avatar, isAdmin = false, onSignOut, onEditProfile }: UserMenuProps) {
    const router = useRouter();
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭 popover
    useEffect(() => {
        if (!popoverOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current?.contains(e.target as Node)) return;
            if (triggerRef.current?.contains(e.target as Node)) return;
            setPopoverOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [popoverOpen]);

    const handleMenuClick = (key: string) => {
        setPopoverOpen(false);
        setDrawerVisible(false);
        if (key === 'profile') {
            onEditProfile?.();
        } else if (key === 'progress') {
            router.push('/dashboard/progress');
        } else if (key === 'memory') {
            router.push('/dashboard/memory');
        } else if (key === 'lab') {
            router.push('/dashboard/lab');
        } else if (key === 'optimization') {
            router.push('/dashboard/optimization');
        } else if (key === 'prompts') {
            router.push('/dashboard/prompts');
        } else if (key === 'users') {
            router.push('/dashboard/users');
        } else if (key === 'invites') {
            router.push('/dashboard/invites');
        } else if (key === 'logout') {
            onSignOut();
        }
    };

    const menuItems = (
        <>
            <div onClick={() => handleMenuClick('profile')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-500"><IconEdit style={{ fontSize: 18 }} /></div>
                <span className="text-gray-700 font-medium">编辑资料</span>
            </div>

            <div onClick={() => handleMenuClick('progress')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors md:hidden">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500"><IconArrowRise style={{ fontSize: 18 }} /></div>
                <span className="text-gray-700 font-medium">情绪趋势</span>
            </div>

            <div onClick={() => handleMenuClick('memory')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors md:hidden">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-500"><IconMindMapping style={{ fontSize: 18 }} /></div>
                <span className="text-gray-700 font-medium">我的记忆</span>
            </div>

            <div onClick={() => handleMenuClick('lab')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors md:hidden">
                <div className="p-2 bg-cyan-50 rounded-lg text-cyan-600"><IconExperiment style={{ fontSize: 18 }} /></div>
                <span className="text-gray-700 font-medium">实验室</span>
            </div>

            {isAdmin && (
                <div onClick={() => handleMenuClick('optimization')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors">
                    <div className="p-2 bg-amber-50 rounded-lg text-amber-500">
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                    </div>
                    <span className="text-gray-700 font-medium">评测中心</span>
                </div>
            )}
            {isAdmin && (
                <div onClick={() => handleMenuClick('prompts')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors">
                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500">
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <span className="text-gray-700 font-medium">系统 Prompts</span>
                </div>
            )}
            {isAdmin && (
                <div onClick={() => handleMenuClick('users')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
                        <IconUser style={{ fontSize: 18 }} />
                    </div>
                    <span className="text-gray-700 font-medium">用户管理</span>
                </div>
            )}
            {isAdmin && (
                <div onClick={() => handleMenuClick('invites')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors">
                    <div className="p-2 bg-pink-50 rounded-lg text-pink-500">
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                        </svg>
                    </div>
                    <span className="text-gray-700 font-medium">邀请码管理</span>
                </div>
            )}

            <div className="mx-3 my-1 border-t border-gray-100" />

            <div onClick={() => handleMenuClick('logout')} className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 cursor-pointer rounded-lg transition-colors text-red-600">
                <div className="p-2 bg-red-50 rounded-lg"><IconExport style={{ fontSize: 18 }} /></div>
                <span className="font-medium">退出登录</span>
            </div>
        </>
    );

    const UserButton = ({ onClick }: { onClick?: () => void }) => (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-indigo-50 active:scale-95 transition-all group cursor-pointer shadow-xs border border-gray-100"
        >
            <div className="relative shrink-0">
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-xs z-10"></div>
                <div className="w-[34px] h-[34px] rounded-full ring-2 ring-white shadow-md overflow-hidden bg-white flex items-center justify-center
                    transition-transform duration-500 ease-out group-hover:rotate-12 group-hover:scale-105">
                    {avatar ? (
                        <img src={avatar} alt={nickname || userName} className="w-full h-full object-cover" />
                    ) : (
                        <IconUser className="text-gray-400" style={{ fontSize: 18 }} />
                    )}
                </div>
            </div>

            <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-indigo-600 transition-colors">
                    {nickname || userName || '用户'}
                </p>
                <p className="text-xs text-gray-400 font-normal">个性化设置</p>
            </div>

            <svg
                className={`w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-all ${popoverOpen ? 'rotate-0' : 'rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        </button>
    );

    return (
        <>
            {/* Desktop: CSS Popover（无 Portal，即时响应） */}
            <div className="hidden md:block w-full relative" ref={triggerRef}>
                <UserButton onClick={() => setPopoverOpen(v => !v)} />

                {/* 菜单面板 — 始终在 DOM 中，用 CSS 控制显隐 */}
                <div
                    ref={popoverRef}
                    className={`absolute bottom-full left-0 right-0 mb-2 z-50
                        bg-white rounded-xl shadow-lg border border-gray-100 py-2
                        transition-all duration-150 origin-bottom
                        ${popoverOpen
                            ? 'opacity-100 scale-100 pointer-events-auto'
                            : 'opacity-0 scale-95 pointer-events-none'
                        }`}
                >
                    {[
                        { key: 'profile', icon: <IconEdit style={{ fontSize: 16 }} />, label: '编辑资料', color: 'text-indigo-500', bgColor: 'bg-indigo-50' },
                        { key: 'progress', icon: <IconArrowRise style={{ fontSize: 16 }} />, label: '情绪趋势', color: 'text-emerald-500', bgColor: 'bg-emerald-50' },
                        { key: 'memory', icon: <IconMindMapping style={{ fontSize: 16 }} />, label: '我的记忆', color: 'text-purple-500', bgColor: 'bg-purple-50' },
                        { key: 'lab', icon: <IconExperiment style={{ fontSize: 16 }} />, label: '实验室', color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
                    ].map(item => (
                        <div key={item.key} onClick={() => handleMenuClick(item.key)}
                            className="flex items-center gap-3 px-4 py-2.5 mx-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                            <div className={`p-1.5 ${item.bgColor} rounded-lg ${item.color}`}>{item.icon}</div>
                            <span className="text-sm text-gray-700 font-medium">{item.label}</span>
                        </div>
                    ))}
                    {isAdmin && (
                        <>
                            <div className="mx-4 my-1.5 border-t border-gray-100" />
                            {[
                                { key: 'optimization', icon: '🚀', label: '评测中心' },
                                { key: 'prompts', icon: '📝', label: '系统 Prompts' },
                                { key: 'users', icon: <IconUser style={{ fontSize: 16 }} />, label: '用户管理', color: 'text-blue-500', bgColor: 'bg-blue-50' },
                                { key: 'invites', icon: '🎟️', label: '邀请码管理' },
                            ].map(item => (
                                <div key={item.key} onClick={() => handleMenuClick(item.key)}
                                    className="flex items-center gap-3 px-4 py-2.5 mx-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                                    {typeof item.icon === 'string' ? (
                                        <span className="text-base w-[28px] h-[28px] flex items-center justify-center">{item.icon}</span>
                                    ) : (
                                        <div className={`p-1.5 ${(item as any).bgColor || 'bg-gray-50'} rounded-lg ${(item as any).color || 'text-gray-500'}`}>{item.icon}</div>
                                    )}
                                    <span className="text-sm text-gray-700 font-medium">{item.label}</span>
                                </div>
                            ))}
                        </>
                    )}
                    <div className="mx-4 my-1.5 border-t border-gray-100" />
                    <div onClick={() => handleMenuClick('logout')}
                        className="flex items-center gap-3 px-4 py-2.5 mx-1.5 rounded-lg hover:bg-red-50 cursor-pointer transition-colors">
                        <div className="p-1.5 bg-red-50 rounded-lg text-red-500"><IconExport style={{ fontSize: 16 }} /></div>
                        <span className="text-sm text-red-600 font-medium">退出登录</span>
                    </div>
                </div>
            </div>

            {/* Mobile: Drawer (Bottom ActionSheet style) */}
            <div className="md:hidden w-full">
                <div onClick={() => setDrawerVisible(true)}>
                    <UserButton />
                </div>
                <Drawer
                    visible={drawerVisible}
                    onCancel={() => setDrawerVisible(false)}
                    placement="bottom"
                    height="auto"
                    footer={null}
                    title={
                        <div className="text-center w-full relative">
                            <span className="text-gray-900 font-semibold">账户与设置</span>
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-200 rounded-full"></div>
                        </div>
                    }
                    className="rounded-t-2xl [&_.arco-drawer-header]:border-none [&_.arco-drawer-header]:pt-4"
                >
                    <div className="pb-6 space-y-1">
                        {menuItems}
                    </div>
                </Drawer>
            </div>
        </>
    );
}
