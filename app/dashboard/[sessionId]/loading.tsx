
import { Skeleton } from '@arco-design/web-react';

export default function Loading() {
    return (
        <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-slate-50">
            {/* 顶部栏 Skeleton */}
            <header className="w-full bg-white/80 backdrop-blur-sm border-b border-gray-100 z-20 shrink-0">
                <div className="w-full max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Title Skeleton */}
                        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
                    </div>
                </div>
            </header>

            {/* 消息列表 Skeleton */}
            <section className="flex-1 w-full max-w-4xl mx-auto p-4 space-y-6 overflow-hidden">
                {/* AI Message Skeleton */}
                <div className="flex gap-4 max-w-[90%]">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                    </div>
                </div>

                {/* User Message Skeleton */}
                <div className="flex gap-4 max-w-[90%] ml-auto flex-row-reverse">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-10 w-48 bg-indigo-100 rounded-2xl animate-pulse" />
                    </div>
                </div>

                {/* AI Message Skeleton */}
                <div className="flex gap-4 max-w-[90%]">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-4 w-56 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                    </div>
                </div>
            </section>

            {/* 输入框 Skeleton */}
            <footer className="w-full bg-slate-50 z-30 shrink-0 pb-[env(safe-area-inset-bottom)] border-t border-gray-100">
                <div className="mx-auto w-full max-w-4xl px-4 py-3">
                    <div className="h-12 w-full bg-gray-200 rounded-xl animate-pulse" />
                </div>
            </footer>
        </div>
    );
}
