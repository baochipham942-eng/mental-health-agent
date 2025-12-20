'use client';

import { IconPlus } from '@arco-design/web-react/icon';
import Image from 'next/image';

interface SidebarHeaderClientProps {
    createNewSessionAction: any; // We'll pass the server action here
}

export function SidebarHeaderClient({ createNewSessionAction }: SidebarHeaderClientProps) {
    return (
        <>
            {/* Sidebar Header - Logo as a whole unit */}
            <div className="mb-6 px-1">
                <div className="flex items-center gap-2.5 group cursor-pointer">
                    {/* Logo Container with 2 elements for animation */}
                    <div className="w-9 h-9 relative overflow-visible flex items-center justify-center">
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
                    <div>
                        <h1 className="font-semibold text-base text-gray-800 leading-tight">心灵树洞</h1>
                        <p className="text-[11px] text-gray-400">倾诉你的心声</p>
                    </div>
                </div>
            </div>

            <form action={createNewSessionAction}>
                <button className="flex w-full h-[40px] items-center justify-center gap-1.5 rounded-lg bg-indigo-50 px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors">
                    <IconPlus style={{ fontSize: 14 }} />
                    <span>新咨询</span>
                </button>
            </form>
        </>
    );
}
