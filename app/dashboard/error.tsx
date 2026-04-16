'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div role="alert" className="bg-white rounded-2xl shadow-xs border border-gray-100 p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">😵</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">出了点问题</h2>
        <p className="text-sm text-gray-500 mb-6">
          页面遇到了意外错误，请尝试刷新页面。
        </p>
        <button
          onClick={reset}
          aria-label="重试加载页面"
          className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors"
        >
          重试
        </button>
      </div>
    </div>
  );
}
