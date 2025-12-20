'use client';

import { IconPlus } from '@arco-design/web-react/icon';
import { Logo } from '@/components/logo/Logo';

interface SidebarHeaderClientProps {
    createNewSessionAction: any; // We'll pass the server action here
}

export function SidebarHeaderClient({ createNewSessionAction }: SidebarHeaderClientProps) {
    return (
        <>
            {/* Sidebar Header - Logo as a whole unit */}
            <div className="mb-6 px-1">
                <Logo />
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
