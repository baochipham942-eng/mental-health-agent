'use client';

import React, { useState } from 'react';
import { Dropdown, Menu, Divider, Drawer } from '@arco-design/web-react';
import { IconUser, IconMindMapping, IconExport, IconExperiment, IconEdit } from '@arco-design/web-react/icon';
import { useRouter } from 'next/navigation';

interface UserMenuProps {
    userName?: string;
    nickname?: string;
    avatar?: string;
    isAdmin?: boolean;
    onSignOut: () => void;
    onEditProfile?: () => void;
}

/**
 * User Menu Component
 * Uses ByteDance's Arco Design Framework (@arco-design/web-react)
 * Features:
 * - Arco Dropdown & Menu components
 * - Custom animated avatar trigger on hover (rotates like the logo)
 * - "Lab" (Wisdom Hall) access
 */
export function UserMenu({ userName, nickname, avatar, isAdmin = false, onSignOut, onEditProfile }: UserMenuProps) {
    const router = useRouter();
    const [drawerVisible, setDrawerVisible] = useState(false);

    const handleMenuClick = (key: string) => {
        setDrawerVisible(false); // Enable closing drawer on selection
        if (key === 'profile') {
            onEditProfile?.();
        } else if (key === 'memory') {
            router.push('/dashboard/memory');
        } else if (key === 'lab') {
            router.push('/dashboard/lab');
        } else if (key === 'optimization') {
            router.push('/dashboard/optimization');
        } else if (key === 'prompts') {
            router.push('/dashboard/prompts');
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

            <div onClick={() => handleMenuClick('memory')} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors md:hidden">
                {/* Mobile only duplicate for safety, though exposed in main menu too */}
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
                    <span className="text-gray-700 font-medium">Prompt 优化</span>
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

            <Divider style={{ margin: '8px 0' }} />

            <div onClick={() => handleMenuClick('logout')} className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 cursor-pointer rounded-lg transition-colors text-red-600">
                <div className="p-2 bg-red-50 rounded-lg"><IconExport style={{ fontSize: 18 }} /></div>
                <span className="font-medium">退出登录</span>
            </div>
        </>
    );

    const dropdownMenu = (
        <Menu onClickMenuItem={handleMenuClick} className="min-w-[180px] select-none py-1">
            <Menu.Item key="profile"><div className="flex gap-2 items-center"><IconEdit className="text-indigo-500" /> 编辑资料</div></Menu.Item>
            <Menu.Item key="memory"><div className="flex gap-2 items-center"><IconMindMapping className="text-purple-500" /> 我的记忆</div></Menu.Item>
            <Menu.Item key="lab"><div className="flex gap-2 items-center"><IconExperiment className="text-cyan-600" /> 实验室</div></Menu.Item>
            {isAdmin && <Menu.Item key="optimization"><div className="flex gap-2 items-center"><span className="text-amber-500 text-xs">🚀</span> Prompt 优化</div></Menu.Item>}
            {isAdmin && <Menu.Item key="prompts"><div className="flex gap-2 items-center"><span className="text-emerald-500 text-xs">📝</span> 系统 Prompts</div></Menu.Item>}
            <Divider style={{ margin: '4px 0' }} />
            <Menu.Item key="logout"><div className="flex gap-2 items-center text-red-600"><IconExport /> 退出登录</div></Menu.Item>
        </Menu>
    );

    const UserButton = () => (
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-indigo-50 active:scale-95 transition-all group cursor-pointer shadow-sm border border-slate-100">
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
                <p className="text-xs text-slate-400 font-normal">个性化设置</p>
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
    );

    return (
        <>
            {/* Desktop: Dropdown */}
            <div className="hidden md:block w-full">
                <Dropdown droplist={dropdownMenu} position="top" trigger="click">
                    <div><UserButton /></div>
                </Dropdown>
            </div>

            {/* Mobile: Drawer (Bottom ActionSheet style) */}
            <div className="md:hidden w-full">
                <div onClick={() => setDrawerVisible(true)}><UserButton /></div>
                <Drawer
                    visible={drawerVisible}
                    onCancel={() => setDrawerVisible(false)}
                    placement="bottom"
                    height="auto"
                    footer={null}
                    title={
                        <div className="text-center w-full relative">
                            <span className="text-gray-900 font-semibold">账户与设置</span>
                            {/* Drag handle hint */}
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
