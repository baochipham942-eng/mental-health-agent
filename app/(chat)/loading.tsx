export default function Loading() {
    return (
        <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-gray-50">
            {/* 顶部栏骨架 */}
            <header className="w-full bg-white/80 backdrop-blur-sm border-b border-gray-100 z-20 shrink-0">
                <div className="w-full max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
            </header>

            {/* 中间留白 - 等待客户端渲染 */}
            <section className="flex-1 w-full" />

            {/* 输入框骨架 */}
            <footer className="w-full bg-gray-50 z-30 shrink-0 pb-[env(safe-area-inset-bottom)] border-t border-gray-100">
                <div className="mx-auto w-full max-w-4xl px-4 py-3">
                    <div className="h-12 w-full bg-gray-200 rounded-xl animate-pulse" />
                </div>
            </footer>
        </div>
    );
}
