'use client';

import React, { useState } from 'react';
import { Drawer, Collapse, Avatar } from '@arco-design/web-react';
import {
    IconHistory, IconExperiment, IconMindMapping,
    IconPlus, IconPoweroff, IconDashboard, IconBulb
} from '@arco-design/web-react/icon';
import { MobileHeader } from './MobileHeader';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { User } from 'next-auth';
import { signOut } from 'next-auth/react';
import { useChatStore } from '@/store/chatStore';

interface SidebarMobileWrapperProps {
    header: React.ReactNode;
    history: React.ReactNode;
    userMenu: React.ReactNode; // Keep for desktop
    user?: User & { nickname?: string | null; avatar?: string | null };
    isAdmin?: boolean;
}

const CollapseItem = Collapse.Item;

export function SidebarMobileWrapper({ header, history, userMenu, user, isAdmin }: SidebarMobileWrapperProps) {
    const [visible, setVisible] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    // 基础菜单项
    const baseMenuItems = [
        { key: 'memory', label: '我的记忆', path: '/dashboard/memory', icon: <IconMindMapping /> },
        { key: 'lab', label: '心理实验室', path: '/dashboard/lab', icon: <IconExperiment /> },
    ];

    // 管理员菜单项
    const adminItems = isAdmin ? [
        { key: 'optimization', label: 'Prompt 优化', path: '/dashboard/optimization', icon: <IconBulb /> },
        { key: 'prompts', label: '系统 Prompt', path: '/dashboard/prompts', icon: <IconDashboard /> },
    ] : [];

    // 组件：菜单链接
    const MenuLink = ({ item, onClick }: { item: { label: string, icon: React.ReactNode, path?: string, onClick?: () => void }, onClick?: () => void }) => {
        const isActive = item.path && pathname === item.path;

        const Content = () => (
            <>
                <div className={cn("text-2xl mb-1 transition-colors", isActive ? "text-indigo-600" : "text-gray-600")}>
                    {item.icon}
                </div>
                <span className={cn("text-[10px] font-medium transition-colors text-center leading-tight", isActive ? "text-indigo-600" : "text-gray-600")}>
                    {item.label}
                </span>
            </>
        );

        const className = cn(
            "flex flex-col items-center justify-center gap-1 p-3 rounded-2xl transition-all border h-[80px]",
            isActive
                ? "bg-indigo-50 border-indigo-100 shadow-sm"
                : "bg-gray-50 border-gray-100 hover:bg-gray-100 active:bg-gray-200"
        );

        if (item.path) {
            return (
                <Link
                    href={item.path}
                    onClick={() => { setVisible(false); onClick?.(); }}
                    className={className}
                >
                    <Content />
                </Link>
            );
        }

        return (
            <button
                onClick={() => { setVisible(false); item.onClick?.(); onClick?.(); }}
                className={className}
            >
                <Content />
            </button>
        );
    };

    return (
        <>
            <MobileHeader onMenuClick={() => setVisible(true)} />

            {/* Desktop Sidebar */}
            <div className="hidden md:flex flex-col w-64 flex-none bg-white shadow-[4px_0_24px_rgba(0,0,0,0.03)] z-10 relative h-full">
                <div className="flex h-full flex-col px-3 py-4 md:px-3">
                    {header}
                    <div className="flex grow flex-col min-h-0 space-y-2 overflow-hidden">
                        <div className="flex flex-col min-h-0 grow">
                            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-5 mb-2 px-1">
                                历史记录
                            </div>
                            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
                                {history}
                            </div>
                        </div>
                        <div className="flex-shrink-0 mt-auto pt-3 border-t border-slate-100">
                            {userMenu}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Sheet */}
            <Drawer
                visible={visible}
                onCancel={() => setVisible(false)}
                placement="bottom"
                height="auto"
                footer={null}
                closable={false}
                maskClosable={true}
                unmountOnExit={true}
                className="block md:hidden rounded-t-[24px] overflow-hidden"
                style={{ borderRadius: '24px 24px 0 0', maxHeight: '90%' }}
            >
                <div className="flex flex-col bg-white pb-safe">
                    {/* 1. Header: Compact User Info (No subtitle, less padding) */}
                    <div className="px-6 pt-5 pb-2 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <Avatar size={56} className="bg-indigo-100 text-indigo-600 ring-2 ring-white shadow-sm">
                                {user?.avatar ? (
                                    <img src={user.avatar} alt={user.name || 'User'} />
                                ) : (
                                    (user?.nickname || user?.name || 'U')[0].toUpperCase()
                                )}
                            </Avatar>
                            <span className="text-lg font-bold text-gray-900 leading-tight">
                                {user?.nickname || user?.name || '用户'}
                            </span>
                            {/* Subtitle removed as requested */}
                        </div>
                    </div>

                    {/* 2. Unified Grid Actions */}
                    <div className="px-5 py-4 grid grid-cols-4 gap-3">
                        {/* New Chat - Unified Style */}
                        <MenuLink
                            item={{
                                label: '新咨询',
                                icon: <IconPlus />,
                                onClick: () => {
                                    if (pathname === '/') window.location.href = '/';
                                    else router.push('/');
                                }
                            }}
                        />

                        {baseMenuItems.map(item => <MenuLink key={item.key} item={item} />)}

                        {adminItems.map(item => <MenuLink key={item.key} item={item} />)}

                        {/* Logout Button */}
                        <MenuLink
                            item={{
                                label: '退出登录',
                                icon: <IconPoweroff className="text-red-500" />,
                                onClick: () => signOut()
                            }}
                        />
                    </div>

                    {/* 3. History */}
                    <div className="mt-0 px-4">
                        <Collapse
                            bordered={false}
                            className="bg-transparent"
                            defaultActiveKey={['history_mobile']}
                        >
                            <CollapseItem
                                header={
                                    <div className="flex items-center gap-2 text-gray-500 text-xs font-medium py-1 px-1">
                                        <IconHistory />
                                        <span>历史记录</span>
                                    </div>
                                }
                                name="history_mobile"
                                contentStyle={{ padding: '0 0 12px 0', backgroundColor: 'transparent' }}
                            >
                                <div className="max-h-[300px] overflow-y-auto px-1">
                                    <div onClickCapture={(e) => {
                                        if ((e.target as HTMLElement).closest('a')) {
                                            setVisible(false);
                                        }
                                    }}>
                                        {history}
                                    </div>
                                </div>
                            </CollapseItem>
                        </Collapse>
                    </div>
                </div>
            </Drawer>
        </>
    );
}
