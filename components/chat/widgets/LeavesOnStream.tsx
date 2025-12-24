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
        <div className="relative h-[480px] rounded-xl overflow-hidden mb-2 border border-teal-100 shadow-inner group select-none bg-[#e0f7fa]">
            {/* Exquisite Water Background */}
            <div className="absolute inset-0 z-0">
                {/* Base Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-teal-50 to-blue-50"></div>

                {/* Layer 1: Slow Deep Current (Left to Right) */}
                <div className="absolute bottom-[-20%] left-0 right-0 h-[150%] opacity-40 animate-[wave-flow_12s_linear_infinite]">
                    <svg className="w-[300%] h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                        <path fill="#b2ebf2" d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                    </svg>
                </div>

                {/* Layer 2: Surface Ripples (Left to Right, Faster) */}
                <div className="absolute bottom-[-30%] left-0 right-0 h-[150%] opacity-30 animate-[wave-flow_8s_linear_infinite]">
                    <svg className="w-[300%] h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                        <path fill="#4dd0e1" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,112C672,96,768,96,864,112C960,128,1056,160,1152,160C1248,160,1344,128,1440,112L1440,320L1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                    </svg>
                </div>

                {/* Layer 3: Sun Glimmer Overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.8),transparent_70%)] opacity-60 pointer-events-none mix-blend-soft-light"></div>
            </div>

            <style jsx>{`
                @keyframes wave-flow {
                    0% { transform: translateX(-50%); } 
                    100% { transform: translateX(0%); } // Move Left to Right
                }
            `}</style>

            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                <AnimatePresence>
                    {thoughts.map(leaf => (
                        <LeafNode key={leaf.id} leaf={leaf} onComplete={() => removeLeaf(leaf.id)} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 left-0 right-0 p-4 z-30 flex justify-center pb-6">
                <div className="bg-white/80 backdrop-blur-xl rounded-full shadow-[0_8px_32px_rgba(31,38,135,0.1)] border border-white/60 p-1.5 flex gap-2 w-full max-w-sm transition-all hover:bg-white/90 hover:shadow-lg hover:scale-[1.01]">
                    <input
                        type="text"
                        value={inputTitle}
                        onChange={e => setInputTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addThought()}
                        placeholder="输入此时的一个念头..."
                        className="flex-1 px-4 py-2 rounded-full bg-transparent text-gray-700 placeholder:text-gray-400 focus:outline-none text-sm font-medium"
                    />
                    <button
                        onClick={addThought}
                        disabled={!inputTitle.trim()}
                        className="px-5 py-2 bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 active:scale-95 text-white rounded-full shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold tracking-wide"
                    >
                        放入
                    </button>
                </div>
            </div>

            {thoughts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 pb-20 opacity-30">
                    <span className="text-8xl text-teal-800/10 mb-2 font-serif italic mix-blend-overlay">Flow</span>
                    <span className="text-teal-900/40 text-xs tracking-[0.3em]">让念头随水流去</span>
                </div>
            )}
        </div>
    );
}

function LeafNode({ leaf, onComplete }: { leaf: Leaf, onComplete: () => void }) {
    // Slower, more majestic movement
    const randomDuration = 18 + Math.random() * 8;

    return (
        <motion.div
            initial={{
                x: -180,
                y: 40 + Math.random() * 60,
                rotate: -15,
                scale: 0.9,
                opacity: 0
            }}
            animate={{
                x: ["-20%", "130%"], // Left to Right covering full width
                y: ["10%", "90%"],  // Gentle downstream slope
                rotate: [-15, -5, 5, 25, 45], // Natural slow rotation
                opacity: [0, 1, 1, 1, 0],
            }}
            transition={{
                duration: randomDuration,
                ease: "linear",
            }}
            onAnimationComplete={onComplete}
            className="absolute top-0 left-0 w-full"
            style={{ top: '0%' }}
        >
            {/* 
                Removing outer filter drop-shadow to fix the "border box" issue.
                Shadows will be handled internally or via SVG filters if needed (but clean is better).
            */}
            <div className="relative w-56 h-32 flex items-center justify-center">
                {/* Exquisite Leaf with Gradient Fill */}
                <svg viewBox="0 0 120 60" className="absolute w-full h-full drop-shadow-lg" style={{ filter: 'drop-shadow(0 8px 16px rgba(0,50,30,0.15))' }}>
                    <defs>
                        <linearGradient id="leafGradient" x1="0%" y1="50%" x2="100%" y2="50%">
                            <stop offset="0%" stopColor="#66bb6a" />
                            <stop offset="100%" stopColor="#43a047" />
                        </linearGradient>
                        <linearGradient id="veinGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
                        </linearGradient>
                    </defs>

                    {/* Leaf Body */}
                    <path d="M5,30 Q35,-5 65,5 Q95,15 115,30 Q95,45 65,55 Q35,65 5,30 Z" fill="url(#leafGradient)" />

                    {/* Central Vein */}
                    <path d="M5,30 C35,30 85,30 115,30" stroke="url(#veinGradient)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

                    {/* Side Veins - More organic opacity */}
                    <g stroke="rgba(255,255,255,0.3)" strokeWidth="0.8">
                        <path d="M35,30 L45,15" />
                        <path d="M35,30 L45,45" />
                        <path d="M65,30 L75,15" />
                        <path d="M65,30 L75,45" />
                        <path d="M90,30 L98,20" />
                        <path d="M90,30 L98,40" />
                    </g>

                    {/* Highlight for volume */}
                    <path d="M20,30 Q40,15 60,20" stroke="rgba(255,255,255,0.2)" strokeWidth="2" fill="none" />
                </svg>

                {/* Text Content - Perfectly centered */}
                <div className="relative z-10 w-40 px-4 text-center transform -rotate-1 flex items-center justify-center h-full pb-1">
                    <span className="text-base font-bold text-white tracking-wide leading-tight drop-shadow-md block w-full line-clamp-2 select-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        {leaf.text}
                    </span>
                </div>
            </div>
        </motion.div>
    )
}
