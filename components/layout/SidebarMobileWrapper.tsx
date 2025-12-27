'use client';

import React, { useState } from 'react';
import { Drawer, Collapse, Button, Link as ArcoLink, Avatar } from '@arco-design/web-react';
import { IconMenu, IconHistory, IconExperiment, IconMindMapping, IconSettings, IconHome, IconPlus, IconUser, IconExport } from '@arco-design/web-react/icon';
import { MobileHeader } from './MobileHeader';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { User } from 'next-auth';
import { useChatStore } from '@/store/chatStore';

interface SidebarMobileWrapperProps {
    header: React.ReactNode;
    history: React.ReactNode;
    userMenu: React.ReactNode; // Keep for desktop (Bottom Left)
    user?: User & { nickname?: string | null; avatar?: string | null }; // Needed for Mobile Menu Header
}

const CollapseItem = Collapse.Item;

export function SidebarMobileWrapper({ header, history, userMenu, user }: SidebarMobileWrapperProps) {
    const [visible, setVisible] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { isConsulting, currentSessionId } = useChatStore();

    // 移动端菜单项配置
    const menuItems = [
        // { key: 'home', label: '首页', path: '/', icon: <IconHome /> }, // Logo usually handles this
        { key: 'memory', label: '我的记忆', path: '/dashboard/memory', icon: <IconMindMapping /> },
        { key: 'lab', label: '心理实验室', path: '/dashboard/lab', icon: <IconExperiment /> },
    ];

    const MenuLink = ({ item }: { item: typeof menuItems[0] }) => {
        const isActive = pathname === item.path;
        return (
            <Link
                href={item.path}
                onClick={() => setVisible(false)}
                className={cn(
                    "flex flex-col items-center justify-center gap-1 p-3 rounded-2xl transition-all border",
                    isActive
                        ? "bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm"
                        : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50 hover:border-gray-200"
                )}
            >
                <div className="text-2xl mb-1">{item.icon}</div>
                <span className="text-xs font-medium">{item.label}</span>
            </Link>
        );
    };

    // "New Chat" logic duplicated from SidebarHeaderClient for Mobile Menu
    const handleNewChat = () => {
        setVisible(false);
        // Dispatch event or just navigate?
        // Ideally we reuse the logic. But SidebarHeaderClient logic is complex (Modal confirm).
        // Since SidebarHeaderClient is passed as `header` prop, maybe we just render it?
        // But `SidebarHeaderClient` renders a specific button style.
        // Let's rely on SidebarHeaderClient logic if possible.
        // Or simplified logic: Just push '/' which triggers ChatShell reset?
        if (pathname !== '/') {
            router.push('/');
        } else {
            // Force reset via window reload or store?
            // ChatShell handles logic.
            window.location.reload(); // Brute force but works for "New Chat" on same page
        }
    };

    // We can extract the "New Chat" button from `header` prop?
    // Actually, let's just create a navigation item for "New Consult".
    // Or render standard button.

    return (
        <>
            <MobileHeader onMenuClick={() => setVisible(true)} />

            {/* Desktop Sidebar: Always in DOM, hidden on mobile via CSS */}
            {/* 桌面端保持原有布局结构 */}
            <div className="hidden md:flex flex-col w-64 flex-none bg-white shadow-[4px_0_24px_rgba(0,0,0,0.03)] z-10 relative h-full">
                <div className="flex h-full flex-col px-3 py-4 md:px-3">
                    {header}
                    <div className="flex grow flex-col min-h-0 space-y-2 overflow-hidden">
                        <div className="flex flex-col min-h-0 grow">
                            {/* 桌面端直接展示历史记录 */}
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

            {/* Mobile Bottom Sheet (Unified Menu) */}
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
                    {/* 1. Header: User Info */}
                    <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Avatar size={48} className="bg-indigo-100 text-indigo-600">
                                {user?.avatar ? (
                                    <img src={user.avatar} alt={user.name || 'User'} />
                                ) : (
                                    (user?.nickname || user?.name || 'U')[0].toUpperCase()
                                )}
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="text-lg font-bold text-gray-900">
                                    {user?.nickname || user?.name || '这里没昵称?'}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {user?.email || '点击下方开启新对话'}
                                </span>
                            </div>
                        </div>
                        {/* <Button icon={<IconClose />} shape="circle" onClick={() => setVisible(false)} /> */}
                        {/* Maybe settings icon? */}
                    </div>

                    {/* 2. Primary Actions Grid */}
                    <div className="px-5 py-2 grid grid-cols-3 gap-3">
                        {/* New Chat Button - Prominent */}
                        <Link
                            href="/"
                            onClick={() => {
                                // If already on home, force refresh for new chat
                                if (pathname === '/') window.location.href = '/';
                                setVisible(false);
                            }}
                            className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-indigo-600 text-white shadow-md active:scale-95 transition-transform"
                        >
                            <IconPlus style={{ fontSize: 24, marginBottom: 4 }} />
                            <span className="text-xs font-bold">新咨询</span>
                        </Link>

                        {menuItems.map(item => <MenuLink key={item.key} item={item} />)}
                    </div>

                    {/* 3. Collapsible History */}
                    <div className="mt-4 px-4">
                        <Collapse
                            bordered={false}
                            className="bg-gray-50/50 rounded-2xl"
                            defaultActiveKey={['history_mobile']}
                        >
                            <CollapseItem
                                header={
                                    <div className="flex items-center gap-2 text-gray-700 font-medium py-1">
                                        <IconHistory />
                                        <span>历史记录</span>
                                    </div>
                                }
                                name="history_mobile"
                                contentStyle={{ padding: '0 0 12px 0', backgroundColor: 'transparent' }}
                            >
                                <div className="max-h-[300px] overflow-y-auto px-2">
                                    {/* Make sure SidebarListClient handles mobile click (close menu?) */}
                                    {/* SidebarListClient uses Link, so it navigates. We should close menu on navigation. */}
                                    {/* Wrap history in a div that captures clicks? */}
                                    <div onClickCapture={(e) => {
                                        // Simple heuristic: if clicking a link, close menu
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

                    {/* 4. Footer Actions (Logout, etc)? */}
                    {/* Usually UserMenu has logout. */}
                    {/* We can reproduce it or just leave it. 
                        The user wanted "Avatar and Nickname" in the sheet.
                        Logout is usually in Settings.
                        Let's verify if "userMenu" prop contains Logout.
                        Yes, UserMenuWrapper has signOutAction.
                        For now, maybe just keep it simple.
                    */}
                    <div className="px-6 py-4 mt-2 border-t border-gray-100 flex justify-center">
                        <span className="text-xs text-gray-300">心灵树洞 AI v1.0</span>
                    </div>
                </div>
            </Drawer>
        </>
    );
}
