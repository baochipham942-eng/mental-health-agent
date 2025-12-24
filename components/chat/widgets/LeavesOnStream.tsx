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
        <div className="relative h-[400px] bg-gradient-to-b from-blue-50 to-blue-100 rounded-xl overflow-hidden mb-2 border border-blue-200">
            {/* Stream Background */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 left-0 right-0 h-full bg-[url('https://www.transparenttextures.com/patterns/water-doodles.png')] opacity-20 animate-pulse"></div>
            </div>

            {/* Input Area (Bottom) */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-sm border-t border-white/50 z-20">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputTitle}
                        onChange={e => setInputTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addThought()}
                        placeholder="即使是'我觉得这个练习很傻'也是一个想法..."
                        className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white/50"
                    />
                    <button
                        onClick={addThought}
                        disabled={!inputTitle.trim()}
                        className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-bold shadow-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        放上叶子 🍃
                    </button>
                </div>
            </div>

            {/* Leaves Container */}
            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                <AnimatePresence>
                    {thoughts.map(leaf => (
                        <LeafNode key={leaf.id} leaf={leaf} onComplete={() => removeLeaf(leaf.id)} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Visual Metaphor Hint */}
            {thoughts.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                    <span className="text-gray-400 text-sm italic">等待你的念头...</span>
                </div>
            )}
        </div>
    );
}

function LeafNode({ leaf, onComplete }: { leaf: Leaf, onComplete: () => void }) {
    return (
        <motion.div
            initial={{ y: -50, x: `${leaf.x}%`, opacity: 0, rotate: 0 }}
            animate={{
                y: 350,
                opacity: [0, 1, 1, 0],
                rotate: [0, 10, -10, 20],
                x: [`${leaf.x}%`, `${leaf.x - 5}%`, `${leaf.x + 5}%`, `${leaf.x}%`]
            }}
            transition={{ duration: 8, ease: "linear" }}
            onAnimationComplete={onComplete}
            className="absolute top-0"
        >
            <div className="relative w-32 h-16 flex items-center justify-center">
                {/* SVG Leaf Shape */}
                <svg viewBox="0 0 100 50" className="absolute w-full h-full text-green-500 drop-shadow-md fill-current opacity-90">
                    <path d="M0,25 Q25,0 50,25 T100,25 Q75,50 50,25 T0,25 Z" />
                </svg>
                {/* Text Content */}
                <span className="relative z-10 text-[10px] text-white font-medium px-2 text-center line-clamp-2 max-w-[90%] select-none">
                    {leaf.text}
                </span>
            </div>
        </motion.div>
    )
}
