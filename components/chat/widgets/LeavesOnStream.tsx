'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeavesOnStreamProps {
    onComplete: (duration: number) => void;
    setHeaderControl: (node: React.ReactNode) => void;
    onStart: () => void;
}

interface Leaf {
    id: string;
    text: string;
    x: number; // Horizontal position (%)
    delay: number;
}

export function LeavesOnStream({ onComplete, setHeaderControl, onStart }: LeavesOnStreamProps) {
    const [thoughts, setThoughts] = useState<Leaf[]>([]);
    const [inputTitle, setInputTitle] = useState('');
    const [isStarted, setIsStarted] = useState(false);
    const [showGuide, setShowGuide] = useState(true);

    // Initialize header controls
    useEffect(() => {
        if (isStarted) {
            setHeaderControl(
                <button
                    onClick={() => onComplete(0)} // No standardized duration for this
                    className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-full text-xs font-medium hover:bg-gray-50 hover:text-green-600 transition-colors"
                >
                    结束练习
                </button>
            );
        } else {
            setHeaderControl(null);
        }
    }, [isStarted, setHeaderControl, onComplete]);

    const handleStart = () => {
        setIsStarted(true);
        setShowGuide(false);
        onStart();
    };

    const addThought = () => {
        if (!inputTitle.trim()) return;

        const newLeaf: Leaf = {
            id: Date.now().toString(),
            text: inputTitle,
            x: Math.random() * 60 + 20, // 20% to 80% screen width
            delay: 0
        };

        setThoughts(prev => [...prev, newLeaf]);
        setInputTitle('');
    };

    // Remove leaf after animation completes (approx 8s)
    const removeLeaf = (id: string) => {
        setThoughts(prev => prev.filter(t => t.id !== id));
    };

    if (!isStarted) {
        return (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="mb-4 text-4xl">🍃</div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">想法脱钩练习</h3>
                <p className="text-gray-600 text-sm max-w-xs mb-6 leading-relaxed">
                    想象你正坐在一条缓缓流淌的小溪边。<br />
                    对于头脑中出现的每一个想法 —— 无论是积极的、消极的，还是中立的 —— <br />
                    以此把它放在一片树叶上，看着它顺流而下。
                </p>
                <button
                    onClick={handleStart}
                    className="px-8 py-3 bg-green-600 text-white rounded-full text-sm font-bold shadow-lg hover:bg-green-700 hover:shadow-xl transition-all transform hover:scale-105"
                >
                    开始练习
                </button>
            </div>
        );
    }

    return (
        <div className="relative h-[480px] bg-gradient-to-br from-cyan-100 to-blue-200 rounded-xl overflow-hidden mb-2 border border-blue-200 shadow-inner group transition-all">
            {/* Stream Background - Improved Realism */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                {/* Main gradient with subtle flow */}
                <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.4)_0%,transparent_30%,transparent_70%,rgba(255,255,255,0.4)_100%)] animate-[shimmer-water_8s_ease-in-out_infinite]"></div>
                {/* Ripple patterns */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.8),transparent_70%)]"></div>
                <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 animate-[flow-texture_20s_linear_infinite] mix-blend-overlay"></div>
            </div>

            <style jsx>{`
                @keyframes shimmer-water {
                    0%, 100% { transform: translateX(-5%) translateY(-2%); }
                    50% { transform: translateX(5%) translateY(2%); }
                }
                @keyframes flow-texture {
                    0% { transform: rotate(0deg) translate(0, 0); }
                    100% { transform: rotate(5deg) translate(50px, 50px); }
                }
            `}</style>

            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                <AnimatePresence>
                    {thoughts.map(leaf => (
                        <LeafNode key={leaf.id} leaf={leaf} onComplete={() => removeLeaf(leaf.id)} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Input Area (Bottom) - Compact Design */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-white/80 backdrop-blur-md border-t border-white/60 z-30">
                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        value={inputTitle}
                        onChange={e => setInputTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addThought()}
                        placeholder="输入一个念头..."
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 bg-white/90 placeholder:text-gray-400 h-9"
                    />
                    <button
                        onClick={addThought}
                        disabled={!inputTitle.trim()}
                        className="px-3 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 h-9 shrink-0"
                    >
                        <span>放上叶子</span>
                        <span className="text-base">🍃</span>
                    </button>
                </div>
                <div className="text-center mt-1.5">
                    <p className="text-[10px] text-gray-500/80 font-medium tracking-wide">观察它，不要评判，让水流带走它</p>
                </div>
            </div>

            {thoughts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 pb-16">
                    <span className="text-4xl mb-2 opacity-40 filter blur-[0.5px]">🌊</span>
                    <span className="text-blue-900/30 text-xs font-medium tracking-[0.2em] uppercase">Stream of Consciousness</span>
                </div>
            )}
        </div>
    );
}

function LeafNode({ leaf, onComplete }: { leaf: Leaf, onComplete: () => void }) {
    const randomDuration = 10 + Math.random() * 5;

    return (
        <motion.div
            initial={{
                x: -60,
                y: 20 + Math.random() * 20,
                opacity: 0,
                rotate: -45,
                scale: 0.8
            }}
            animate={{
                x: ["0%", "120%"],
                y: ["0%", "400px"],
                opacity: [0, 1, 1, 1, 0],
                rotate: [-45, -15, 10, 45, 80],
                scale: [0.8, 1, 1, 0.9],
            }}
            transition={{
                duration: randomDuration,
                ease: "linear",
            }}
            onAnimationComplete={onComplete}
            className="absolute top-0 left-0"
            style={{ top: '5%' }}
        >
            <div className="relative w-36 h-18 flex items-center justify-center filter drop-shadow-sm">
                {/* More Delicate Leaf Shape */}
                <svg viewBox="0 0 100 50" className="absolute w-full h-full fill-emerald-500/90 stroke-emerald-600/20 stroke-[0.5]">
                    <path d="M5,25 Q30,5 55,8 Q80,11 98,25 Q75,39 50,42 Q25,45 5,25 Z" />
                    <path d="M5,25 L95,25" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" fill="none" />
                    {/* Subtle Veins */}
                    <path d="M30,25 L38,15 M30,25 L38,35 M55,25 L63,15 M55,25 L63,35 M75,25 L82,18 M75,25 L82,32" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" fill="none" />
                </svg>

                <div className="relative z-10 px-4 w-full flex items-center justify-center transform -rotate-1">
                    <span className="text-xs font-medium text-white/95 text-center leading-tight tracking-wide drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)] line-clamp-2 w-full break-words">
                        {leaf.text}
                    </span>
                </div>
            </div>
        </motion.div>
    )
}
