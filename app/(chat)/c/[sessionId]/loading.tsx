
export default function Loading() {
    return (
        <div className="flex h-full flex-col bg-white">
            {/* Header Skeleton */}
            <div className="flex h-16 items-center border-b border-gray-200 px-4 bg-white/80 backdrop-blur-xs sticky top-0 z-10">
                <div className="h-6 w-24 bg-gray-100 rounded-sm animate-pulse" />
            </div>

            {/* Messages Skeleton */}
            <div className="flex-1 overflow-hidden p-4 space-y-6">
                {/* User Message Skeleton */}
                <div className="flex justify-end">
                    <div className="h-10 w-2/3 max-w-[300px] bg-blue-50 rounded-2xl rounded-tr-none animate-pulse" />
                </div>

                {/* AI Message Skeleton */}
                <div className="flex justify-start">
                    <div className="h-24 w-full max-w-3xl bg-white border border-gray-100 shadow-xs rounded-2xl rounded-tl-none p-4 animate-pulse">
                        <div className="space-y-3">
                            <div className="h-4 w-3/4 bg-gray-100 rounded-sm" />
                            <div className="h-4 w-1/2 bg-gray-100 rounded-sm" />
                        </div>
                    </div>
                </div>

                {/* User Message Skeleton */}
                <div className="flex justify-end">
                    <div className="h-12 w-1/2 max-w-[250px] bg-blue-50 rounded-2xl rounded-tr-none animate-pulse" />
                </div>

                {/* AI Message Skeleton (Loading state) */}
                <div className="flex justify-start items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
                    <div className="h-4 w-24 bg-gray-100 rounded-sm animate-pulse" />
                </div>
            </div>

            {/* Input Area Skeleton */}
            <div className="p-4 bg-white border-t border-gray-200">
                <div className="h-24 w-full bg-gray-50 rounded-2xl border border-gray-200 animate-pulse" />
            </div>
        </div>
    );
}
