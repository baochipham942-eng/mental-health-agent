'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const NAV_GROUPS = [
    {
        label: '评测',
        items: [
            { href: '/dashboard/optimization', label: '实验', exact: true },
            { href: '/dashboard/optimization/datasets', label: '数据集' },
            { href: '/dashboard/optimization/graders', label: '评分器' },
            { href: '/dashboard/optimization/calibration', label: '校准' },
            { href: '/dashboard/optimization/ci-runs', label: 'CI' },
        ],
    },
    {
        label: '观测',
        items: [
            { href: '/dashboard/optimization/online-quality', label: '线上质量' },
            { href: '/dashboard/optimization/trace', label: '轨迹分析' },
            { href: '/dashboard/optimization/metrics', label: '观测统计' },
            { href: '/dashboard/optimization/security', label: '安全红线' },
        ],
    },
    {
        label: '优化',
        items: [
            { href: '/dashboard/optimization/analysis', label: '根因分析' },
            { href: '/dashboard/optimization/prompt-versions', label: 'Prompt版本' },
            { href: '/dashboard/optimization/version-compare', label: '版本对比' },
        ],
    },
    {
        label: '标注',
        items: [
            { href: '/dashboard/optimization/annotation-queue', label: '标注队列' },
            { href: '/dashboard/optimization/agreement', label: '一致性' },
        ],
    },
];

export default function EvalNav() {
    const pathname = usePathname();

    return (
        <div className="shrink-0 bg-white border-b border-gray-200 px-6">
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
                <nav className="flex items-center gap-0.5">
                    {NAV_GROUPS.map((group, gi) => (
                        <div key={group.label} className="flex items-center">
                            {gi > 0 && (
                                <div className="w-px h-4 bg-gray-200 mx-2" />
                            )}
                            <span className="text-[10px] text-gray-400 font-medium mr-1 hidden lg:inline">
                                {group.label}
                            </span>
                            {group.items.map(item => {
                                const isActive = item.exact
                                    ? pathname === item.href || pathname.startsWith('/dashboard/optimization/exp/')
                                    : pathname.startsWith(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                                            isActive
                                                ? 'bg-indigo-50 text-indigo-700'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                        )}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </div>
        </div>
    );
}
