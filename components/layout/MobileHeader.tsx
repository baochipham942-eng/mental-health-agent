'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@arco-design/web-react';
import { IconMenu } from '@arco-design/web-react/icon';
import { Logo } from '@/components/logo/Logo';

interface MobileHeaderProps {
    onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
    return (
        <header className="flex md:hidden items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40">
            <Link href="/" className="scale-75 origin-left block cursor-pointer">
                <Logo />
            </Link>
            <button
                onClick={onMenuClick}
                className="w-[44px] h-[44px] flex items-center justify-center rounded-full active:bg-gray-100 transition-colors"
            >
                <IconMenu className="text-gray-600 text-xl" />
            </button>
        </header>
    );
}
