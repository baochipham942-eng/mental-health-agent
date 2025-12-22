'use client';

import React, { useState } from 'react';
import Image from 'next/image';

export function Logo() {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="flex items-center gap-2.5 group cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Logo Container */}
            <div
                className="w-9 h-9 relative overflow-visible flex items-center justify-center shrink-0"
                style={{ width: '36px', height: '36px', position: 'relative' }}
            >
                {/* Static snow on tree */}
                <div className="absolute inset-0 z-10 pointer-events-none">
                    {/* Snow dots on tree */}
                    <div className="absolute top-[8px] left-[12px] w-1.5 h-1.5 bg-white rounded-full shadow-sm opacity-90" />
                    <div className="absolute top-[14px] left-[20px] w-1 h-1 bg-white rounded-full shadow-sm opacity-80" />
                    <div className="absolute top-[10px] right-[10px] w-1.5 h-1.5 bg-white rounded-full shadow-sm opacity-85" />
                    <div className="absolute top-[18px] left-[8px] w-1 h-1 bg-white rounded-full shadow-sm opacity-75" />
                </div>

                {/* Tree Element */}
                <div className="absolute inset-0 translate-y-[4px] transition-transform duration-500 ease-out group-hover:rotate-[12deg] group-hover:scale-110">
                    <Image
                        src="/logo-tree.svg"
                        alt="树洞核心"
                        fill
                        className="object-contain"
                    />
                </div>

                {/* Hat Element */}
                <div className="absolute -top-[3px] left-0 w-full h-full scale-[0.65] transition-all duration-500 ease-out group-hover:-translate-y-2 group-hover:-rotate-[12deg] group-hover:scale-[0.75] group-hover:translate-x-1">
                    <Image
                        src="/logo-hat.svg"
                        alt="圣诞帽"
                        fill
                        className="object-contain"
                    />
                </div>

                {/* Falling snowflakes on hover */}
                {isHovered && (
                    <div className="absolute inset-0 z-20 pointer-events-none overflow-visible">
                        <div className="absolute top-[10px] left-[14px] w-1 h-1 bg-white rounded-full animate-fall-1 opacity-90" />
                        <div className="absolute top-[12px] left-[22px] w-1.5 h-1.5 bg-white rounded-full animate-fall-2 opacity-85" />
                        <div className="absolute top-[8px] right-[12px] w-1 h-1 bg-white rounded-full animate-fall-3 opacity-80" />
                        <div className="absolute top-[16px] left-[10px] w-0.5 h-0.5 bg-white rounded-full animate-fall-4 opacity-75" />
                    </div>
                )}
            </div>

            <div className="mt-1.5">
                <h1 className="font-semibold text-base text-gray-800 leading-tight" style={{ fontSize: '16px', margin: 0 }}>心灵树洞</h1>
                <p className="text-[11px] text-gray-400" style={{ fontSize: '11px', margin: 0 }}>倾诉你的心声</p>
            </div>

            {/* Keyframe animations */}
            <style jsx>{`
                @keyframes fall1 {
                    0% { transform: translateY(0) translateX(0); opacity: 0.9; }
                    100% { transform: translateY(28px) translateX(3px); opacity: 0; }
                }
                @keyframes fall2 {
                    0% { transform: translateY(0) translateX(0); opacity: 0.85; }
                    100% { transform: translateY(24px) translateX(-2px); opacity: 0; }
                }
                @keyframes fall3 {
                    0% { transform: translateY(0) translateX(0); opacity: 0.8; }
                    100% { transform: translateY(30px) translateX(4px); opacity: 0; }
                }
                @keyframes fall4 {
                    0% { transform: translateY(0) translateX(0); opacity: 0.75; }
                    100% { transform: translateY(22px) translateX(-3px); opacity: 0; }
                }
                :global(.animate-fall-1) { animation: fall1 0.8s ease-out forwards; }
                :global(.animate-fall-2) { animation: fall2 0.9s ease-out 0.1s forwards; }
                :global(.animate-fall-3) { animation: fall3 0.7s ease-out 0.2s forwards; }
                :global(.animate-fall-4) { animation: fall4 1s ease-out 0.15s forwards; }
            `}</style>
        </div>
    );
}
