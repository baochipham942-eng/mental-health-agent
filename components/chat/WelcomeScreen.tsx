'use client';

import { useState, useEffect } from 'react';
import { EmotionTrendPanel } from '@/components/progress/EmotionTrendPanel';

interface WelcomeScreenProps {
    isReturningUser: boolean;
    onSendMessage?: (text: string) => void;
}

// 时间问候语
function getTimeGreeting(): { greeting: string; emoji: string } {
    const hour = new Date().getHours();
    if (hour < 6) return { greeting: '夜深了', emoji: '🌙' };
    if (hour < 9) return { greeting: '早上好', emoji: '🌅' };
    if (hour < 12) return { greeting: '上午好', emoji: '☀️' };
    if (hour < 14) return { greeting: '中午好', emoji: '🌤️' };
    if (hour < 18) return { greeting: '下午好', emoji: '🌇' };
    if (hour < 22) return { greeting: '晚上好', emoji: '🌆' };
    return { greeting: '夜深了', emoji: '🌙' };
}

export function WelcomeScreen({ isReturningUser, onSendMessage }: WelcomeScreenProps) {
    // 仅客户端渲染 - 使用 useState 确保 SSR 时不渲染任何内容
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        // 延迟显示，确保所有布局都已稳定
        const timer = setTimeout(() => setIsClient(true), 100);
        return () => clearTimeout(timer);
    }, []);

    // SSR 和初始客户端渲染时不显示任何内容
    if (!isClient) {
        return null;
    }

    const { greeting, emoji } = getTimeGreeting();
    const examplePrompts = [
        '最近感觉压力有点大...',
        '晚上总是睡不好觉',
        '想和你聊聊最近的心情',
    ];

    return (
        <div className="min-h-[400px] w-full flex items-center justify-center p-6">
            <div className="text-center max-w-md w-full">
                {/* Greeting */}
                <h2 className="text-xl font-semibold text-gray-800 mb-1">
                    {isReturningUser ? '欢迎回来 👋' : greeting} {!isReturningUser && emoji}
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                    {isReturningUser
                        ? '很高兴再次见到你，有什么想聊的吗？'
                        : '这里是一个安全、私密的空间，你可以随时倾诉你的感受和困扰。'
                    }
                </p>

                {/* 情绪趋势（仅回访用户） */}
                {isReturningUser && (
                    <div className="mb-4">
                        <EmotionTrendPanel />
                    </div>
                )}

                {/* Guidance Cards */}
                <div className="bg-linear-to-br from-indigo-50 to-purple-50 rounded-xl p-4 mb-4 text-left">
                    <p className="text-xs font-medium text-indigo-600 mb-2">💡 不知道说什么？试试这些：</p>
                    <div className="space-y-2">
                        {examplePrompts.map((prompt, idx) => (
                            <button
                                key={idx}
                                onClick={() => onSendMessage?.(prompt)}
                                className="w-full text-left px-3 py-2 bg-white rounded-xl text-sm text-gray-700 hover:bg-indigo-100 hover:text-indigo-700 transition-colors shadow-xs"
                            >
                                &quot;{prompt}&quot;
                            </button>
                        ))}
                    </div>
                </div>

                {/* Privacy note */}
                <p className="text-xs text-gray-400">
                    🔒 你的对话将被安全保存
                </p>
            </div>
        </div>
    );
}
