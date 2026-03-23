'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS = [
    { href: '/dashboard/optimization', label: '实验', exact: true },
    { href: '/dashboard/optimization/datasets', label: '数据集' },
    { href: '/dashboard/optimization/graders', label: '评分器' },
    { href: '/dashboard/optimization/analysis', label: '根因总览' },
    { href: '/dashboard/optimization/calibration', label: '校准' },
    { href: '/dashboard/optimization/online-quality', label: '线上质量' },
    { href: '/dashboard/optimization/prompt-versions', label: 'Prompt版本' },
    { href: '/dashboard/optimization/metrics', label: '观测统计' },
];

export default function EvalNav() {
    const pathname = usePathname();

    return (
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6">
            <div className="max-w-7xl mx-auto flex items-center gap-4 h-12">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors mr-1"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5" />
                        <path d="M12 19l-7-7 7-7" />
                    </svg>
                </Link>
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
