
import { Skeleton } from '@arco-design/web-react';

export default function Loading() {
    return (
        <div className="h-dvh w-full flex flex-col overflow-hidden bg-gray-50" aria-busy="true" aria-label="页面加载中">
            {/* 顶部栏 Skeleton */}
            <header className="w-full bg-white/80 backdrop-blur-xs border-b border-gray-100 z-20 shrink-0">
                <div className="w-full max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Title Skeleton */}
                        <div className="h-6 w-24 bg-gray-200 rounded-sm animate-pulse" />
                    </div>
                </div>
            </header>

            {/* 消息列表区域 - 新会话加载时不显示任何骨架屏，避免闪烁 */}
            <section className="flex-1 w-full flex items-center justify-center p-6 opacity-0">
                {/* 保持空白，等待客户端渲染欢迎界面 */}
            </section>

            {/* 输入框 Skeleton */}
            <footer className="w-full bg-gray-50 z-30 shrink-0 pb-safe border-t border-gray-100">
                <div className="mx-auto w-full max-w-4xl px-4 py-3">
                    <div className="h-12 w-full bg-gray-200 rounded-xl animate-pulse" />
                </div>
            </footer>
        </div>
    );
}
