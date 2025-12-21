'use client';

import { useState } from 'react';

interface InlineMoodRatingProps {
    onRate: (score: number) => void;
}

export function InlineMoodRating({ onRate }: InlineMoodRatingProps) {
    const [hovered, setHovered] = useState<number | null>(null);

    // 1-5 分的表情符号映射
    const emojis = ['😣', '☹️', '😐', '🙂', '😁'];
    const colors = [
        'hover:bg-red-100 text-red-500',
        'hover:bg-orange-100 text-orange-500',
        'hover:bg-yellow-100 text-yellow-600',
        'hover:bg-lime-100 text-lime-600',
        'hover:bg-green-100 text-green-600'
    ];

    return (
        <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-300">
            <h4 className="text-gray-700 font-medium mb-4">练习结束，此刻感觉如何？</h4>

            <div className="flex gap-2">
                {emojis.map((emoji, index) => {
                    const score = index + 1;
                    return (
                        <button
                            key={index}
                            onClick={() => onRate(score)}
                            onMouseEnter={() => setHovered(score)}
                            onMouseLeave={() => setHovered(null)}
                            className={`w-12 h-12 text-2xl rounded-full transition-all transform hover:scale-110 flex items-center justify-center ${colors[index]} bg-gray-50 border border-gray-100 shadow-sm`}
                            title={`${score}分`}
                        >
                            <span className={`transition-transform duration-200 ${hovered === score ? 'scale-125' : ''}`}>
                                {emoji}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="flex justify-between w-full max-w-[280px] mt-2 px-2 text-[10px] text-gray-400">
                <span>很糟糕</span>
                <span>非常好</span>
            </div>
        </div>
    );
}
