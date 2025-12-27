'use client';

import React, { useState } from 'react';
import { Drawer, Collapse, Button } from '@arco-design/web-react';
import { IconMenu, IconHistory, IconExperiment, IconMindMapping, IconSettings, IconHome } from '@arco-design/web-react/icon';
import { MobileHeader } from './MobileHeader';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

interface SidebarMobileWrapperProps {
    header: React.ReactNode;
    history: React.ReactNode;
    userMenu: React.ReactNode;
}

const CollapseItem = Collapse.Item;

export function SidebarMobileWrapper({ header, history, userMenu }: SidebarMobileWrapperProps) {
    const [visible, setVisible] = useState(false);
    const pathname = usePathname();

    // 移动端菜单项配置
    const menuItems = [
        { key: 'memory', label: '我的记忆', path: '/dashboard/memory', icon: <IconMindMapping /> },
        { key: 'lab', label: '心理实验室', path: '/dashboard/lab', icon: <IconExperiment /> },
        // 设置目前通过底部 UserMenu 访问，或者未来可以在这里添加
    ];

    const MenuLink = ({ item }: { item: typeof menuItems[0] }) => {
        const isActive = pathname === item.path;
        return (
            <Link
                href={item.path}
                onClick={() => setVisible(false)}
                className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors mb-1",
                    isActive ? "bg-indigo-50 text-indigo-600 font-medium" : "text-gray-600 hover:bg-gray-50"
                )}
            >
                <div className="text-xl">{item.icon}</div>
                <span>{item.label}</span>
            </Link>
        );
    };

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

            {/* Mobile Drawer (Menu-First Design) */}
            <Drawer
                visible={visible}
                onCancel={() => setVisible(false)}
                placement="left"
                width={300} // slighty wider for better view
                footer={null}
                closable={false}
                maskClosable={true}
                unmountOnExit={true}
                className="block md:hidden [&_.arco-drawer-body]:p-0"
                style={{ padding: 0 }}
            >
                <div className="h-full bg-white flex flex-col">
                    {/* 1. Mobile Drawer Header */}
                    <div className="px-6 py-6 border-b border-gray-100">
                        <div onClick={() => setVisible(false)}>
                            {header}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* 2. Functional Menu Items */}
                        <div className="flex flex-col">
                            <p className="text-xs font-semibold text-gray-400 px-4 mb-2">功能</p>
                            {menuItems.map(item => <MenuLink key={item.key} item={item} />)}
                        </div>

                        {/* 3. Collapsible History */}
                        <div className="mt-4">
                            <p className="text-xs font-semibold text-gray-400 px-4 mb-2">对话</p>
                            <Collapse
                                bordered={false}
                                defaultActiveKey={['history']}
                                className="bg-transparent"
                            >
                                <CollapseItem
                                    header={
                                        <div className="flex items-center gap-2 text-gray-600 font-medium">
                                            <IconHistory />
                                            <span>历史记录</span>
                                        </div>
                                    }
                                    name="history"
                                    contentStyle={{ padding: '0' }}
                                >
                                    <div className="max-h-[300px] overflow-y-auto pr-2">
                                        {/* 在折叠面板中使用 history 组件，需要处理一下 padding/click */}
                                        <div onClick={() => {/* keep drawer open when clicking history item? maybe not */ }}>
                                            {history}
                                        </div>
                                    </div>
                                </CollapseItem>
                            </Collapse>
                        </div>
                    </div>

                    {/* 4. User Menu at Bottom */}
                    <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                        {userMenu}
                    </div>
                </div>
            </Drawer>
        </>
    );
}
