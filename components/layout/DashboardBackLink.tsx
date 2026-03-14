'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Dashboard 返回按钮 — 仅在非 optimization 子页面显示
 * optimization 有自己的 EvalNav 已内置返回
 */
export function DashboardBackLink() {
    const pathname = usePathname();

    // optimization 子页面由 EvalNav 处理返回
    if (pathname.startsWith('/dashboard/optimization')) return null;

    return (
        <div className="flex-shrink-0 px-6 pt-3 pb-1">
            <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                </svg>
                返回首页
            </Link>
        </div>
    );
}
