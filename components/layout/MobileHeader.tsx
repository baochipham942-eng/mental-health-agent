'use client';

import React from 'react';
import { Button } from '@arco-design/web-react';
import { IconMenu } from '@arco-design/web-react/icon';
import { Logo } from '@/components/logo/Logo';

interface MobileHeaderProps {
    onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
    return (
        <header className="flex md:hidden items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40">
            <div className="scale-75 origin-left">
                <Logo />
            </div>
            <Button
                shape="circle"
                type="text"
                icon={<IconMenu className="text-gray-600 text-lg" />}
                onClick={onMenuClick}
            />
        </header>
    );
}
