'use client';

import { useState } from 'react';

export function MoodTracker() {
    const [selectedMood, setSelectedMood] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const moods = [
        { value: 1, emoji: '😢', label: '很差' },
        { value: 2, emoji: '😟', label: '不好' },
        { value: 3, emoji: '😐', label: '一般' },
        { value: 4, emoji: '🙂', label: '不错' },
        { value: 5, emoji: '😄', label: '很好' },
    ];

    const handleSubmit = () => {
        if (!selectedMood) return;
        setSubmitted(true);
        // TODO: 调用 API 保存或更新上下文
    };

    // 统一容器结构 — 避免 submitted 切换时 DOM 结构变化导致父卡片高度跳变
    return (
        <div className="flex flex-col gap-6 p-4 min-h-[200px]">
            {submitted ? (
                <div className="flex flex-col items-center justify-center flex-1 bg-green-50/50 rounded-xl py-6">
                    <div className="text-4xl mb-3 animate-bounce">✨</div>
                    <p className="text-base font-medium text-green-800">心情记录已保存</p>
                    <p className="text-sm text-green-600 mt-1">记录当下是了解自己的第一步</p>
                </div>
            ) : (
                <>
                    <div className="text-center">
                        <h3 className="text-base font-medium text-gray-900 mb-6">现在心情怎么样？</h3>
                        <div className="flex justify-between items-end px-4">
                            {moods.map((m) => (
                                <button
                                    key={m.value}
                                    onClick={() => setSelectedMood(m.value)}
                                    className={`group flex flex-col items-center gap-2 transition-all duration-200 ${selectedMood === m.value
                                        ? 'scale-125 -translate-y-2'
                                        : 'text-gray-400 hover:text-gray-600 hover:scale-110'
                                        }`}
                                >
                                    <span className={`text-3xl transition-all ${selectedMood === m.value ? 'drop-shadow-md' : 'grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100'
                                        }`}>
                                        {m.emoji}
                                    </span>
                                    <span className={`text-[10px] font-medium transition-colors ${selectedMood === m.value ? 'text-blue-600' : 'text-gray-400'
                                        }`}>
                                        {m.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-600 ml-1">想说点什么吗？（可选）</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="记录一下此时此刻的想法..."
                            className="w-full h-24 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none bg-gray-50/50 transition-all placeholder:text-gray-400"
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={handleSubmit}
                            disabled={!selectedMood}
                            className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 shadow-sm ${selectedMood
                                ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            保存记录
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
