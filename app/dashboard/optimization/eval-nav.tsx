'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS = [
    { href: '/dashboard/optimization', label: '实验', exact: true },
    { href: '/dashboard/optimization/datasets', label: '数据集' },
    { href: '/dashboard/optimization/graders', label: '评分器' },
    { href: '/dashboard/optimization/analysis', label: '定性分析' },
];

export default function EvalNav() {
    const pathname = usePathname();

    return (
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6">
            <div className="max-w-7xl mx-auto flex items-center gap-6 h-12">
                <h1 className="text-base font-bold text-gray-900 mr-2 hidden md:block">评测中心</h1>
                <nav className="flex gap-1">
                    {NAV_ITEMS.map(item => {
                        const isActive = item.exact
                            ? pathname === item.href || pathname.startsWith('/dashboard/optimization/exp/')
                            : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-indigo-50 text-indigo-700'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                )}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
