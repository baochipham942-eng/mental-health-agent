'use client';

import React from 'react';
import Image from 'next/image';

export function Logo() {
    return (
        <div className="flex items-center gap-2.5 group cursor-pointer">
            {/* Logo Container with 2 elements for animation */}
            <div
                className="w-9 h-9 relative overflow-visible flex items-center justify-center shrink-0"
                style={{ width: '36px', height: '36px', position: 'relative' }}
            >
                {/* Tree Element: Moved further down, rotates/scales on hover */}
                <div className="absolute inset-0 translate-y-[4px] transition-transform duration-500 ease-out group-hover:rotate-[12deg] group-hover:scale-110">
                    <Image
                        src="/logo-tree.svg"
                        alt="树洞核心"
                        fill
                        className="object-contain"
                    />
                </div>
                {/* Hat Element: Even smaller scale, positioned on tree top */}
                <div className="absolute -top-[3px] left-0 w-full h-full scale-[0.65] transition-all duration-500 ease-out group-hover:-translate-y-2 group-hover:-rotate-[12deg] group-hover:scale-[0.75] group-hover:translate-x-1">
                    <Image
                        src="/logo-hat.svg"
                        alt="圣诞帽"
                        fill
                        className="object-contain"
                    />
                </div>
            </div>
            <div className="mt-1.5">
                <h1 className="font-semibold text-base text-gray-800 leading-tight" style={{ fontSize: '16px', margin: 0 }}>心灵树洞</h1>
                <p className="text-[11px] text-gray-400" style={{ fontSize: '11px', margin: 0 }}>倾诉你的心声</p>
            </div>
        </div>
    );
}
