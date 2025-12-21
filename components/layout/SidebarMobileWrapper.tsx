'use client';

import React, { useState } from 'react';
import { Drawer } from '@arco-design/web-react';
import { MobileHeader } from './MobileHeader';
import { usePathname } from 'next/navigation';

interface SidebarMobileWrapperProps {
    children: React.ReactNode;
}

export function SidebarMobileWrapper({ children }: SidebarMobileWrapperProps) {
    const [visible, setVisible] = useState(false);
    return (
        <>
            <MobileHeader onMenuClick={() => setVisible(true)} />

            {/* Desktop Sidebar: Always in DOM, hidden on mobile via CSS */}
            <div className="hidden md:block w-64 flex-none bg-white shadow-[4px_0_24px_rgba(0,0,0,0.03)] z-10 relative h-full">
                {children}
            </div>

            {/* Mobile Drawer */}
            <Drawer
                visible={visible}
                onCancel={() => setVisible(false)}
                placement="left"
                width={280}
                footer={null}
                closable={false}
                maskClosable={true}
                unmountOnExit={true}
                className="block md:hidden [&_.arco-drawer-body]:p-0"
                style={{ padding: 0 }}
            >
                <div className="h-full bg-white">
                    {children}
                </div>
            </Drawer>
        </>
    );
}
