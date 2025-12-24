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
        <div className="relative h-[480px] bg-gradient-to-br from-blue-300 to-cyan-200 rounded-xl overflow-hidden mb-2 border border-blue-200 shadow-inner group">
            {/* Stream Background - Moving Water Effect */}
            <div className="absolute inset-0 z-0">
                {/* CSS Gradient Animation for Water */}
                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:60px_60px] animate-[move-water_4s_linear_infinite] opacity-30"></div>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-white/40 via-transparent to-transparent opacity-80"></div>
            </div>

            <style jsx>{`
                @keyframes move-water {
                    0% { background-position: 0 0; }
                    100% { background-position: 60px 60px; } // Diagonal movement
                }
            `}</style>

            {/* Leaves Container - z-10 ensures leaves are above background but below UI */}
            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                <AnimatePresence>
                    {thoughts.map(leaf => (
                        <LeafNode key={leaf.id} leaf={leaf} onComplete={() => removeLeaf(leaf.id)} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Input Area (Bottom) - z-30 to be on top */}
            <div className="absolute bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-md border-t border-white/60 z-30 transition-transform duration-300 translate-y-0">
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={inputTitle}
                        onChange={e => setInputTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addThought()}
                        placeholder="输入此时此刻的一个念头..."
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 bg-white/80 placeholder:text-gray-400"
                    />
                    <button
                        onClick={addThought}
                        disabled={!inputTitle.trim()}
                        className="px-5 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl text-base font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
                    >
                        <span>放入叶子</span>
                        <span className="text-xl">🍃</span>
                    </button>
                </div>
                <div className="text-center mt-2.5">
                    <p className="text-xs text-gray-400 font-medium">试着观察甚至不要评判它，仅仅是看着它飘走</p>
                </div>
            </div>

            {/* Visual Metaphor Hint */}
            {thoughts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-60 z-20 pb-20">
                    <span className="text-6xl mb-4 filter drop-shadow-sm opacity-50">🌊</span>
                    <span className="text-blue-900/40 text-lg font-medium tracking-widest uppercase">Stream of Consciousness</span>
                </div>
            )}
        </div>
    );
}

function LeafNode({ leaf, onComplete }: { leaf: Leaf, onComplete: () => void }) {
    // Generate random path variations for natural feel
    // Use stable random values based on leaf ID to avoid hydration mismatch if possible, 
    // or just memoize simple calculations. Here we use simple inline calculation for demo.
    // Random start Y to simulate varied entry points vertically if needed, but here we start top-left.
    const randomY = Math.random() * 80 - 40; // Variation in localized Y
    const randomDuration = 12 + Math.random() * 6; // 12-18s slow float

    return (
        <motion.div
            // Initial: Top-Left (off screen) - utilizing full corner entry
            initial={{
                x: -120,
                y: -50,
                opacity: 0,
                rotate: -60,
                scale: 0.8
            }}
            // Animate to: Bottom-Right (far off screen)
            animate={{
                x: ["0%", "120%"], // Move across screen width + extra
                y: ["0%", "500px"], // Move down significantly
                opacity: [0, 1, 1, 1, 0], // Fade in quickly, stay, fade out
                rotate: [-60, -20, 10, 45, 90], // Progressive rotation
                scale: [0.8, 1, 1.1, 1], // Subtle breathing
            }}
            transition={{
                duration: randomDuration,
                ease: "linear",
            }}
            onAnimationComplete={onComplete}
            className="absolute top-0 left-0"
            style={{ top: '10%' }} // Start slightly down from very top
        >
            <div className="relative w-48 h-24 flex items-center justify-center filter drop-shadow-lg">
                {/* Enhanced Leaf SVG - Larger and more detailed */}
                <svg viewBox="0 0 100 50" className="absolute w-full h-full fill-emerald-500 stroke-emerald-600/30 stroke-1 opacity-90">
                    {/* Main Body */}
                    <path d="M2,25 Q25,0 50,5 Q75,10 98,25 Q75,40 50,45 Q25,50 2,25 Z" />
                    {/* Veins */}
                    <path d="M5,25 L95,25" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" />
                    <path d="M25,25 L35,10 M25,25 L35,40 M50,25 L60,10 M50,25 L60,40 M75,25 L85,15 M75,25 L85,35" stroke="rgba(255,255,255,0.3)" strokeWidth="1" fill="none" />
                </svg>

                {/* Text Content - Larger and clearer */}
                <div className="relative z-10 px-6 py-2 w-full flex items-center justify-center transform -rotate-2">
                    <span className="text-sm font-bold text-white text-center leading-snug tracking-wide drop-shadow-md line-clamp-2 w-full break-words shadow-black/10">
                        {leaf.text}
                    </span>
                </div>
            </div>
        </motion.div>
    )
}
