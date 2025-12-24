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
            <div className="flex flex-col items-center justify-center h-[480px] px-4 text-center select-none transition-all">
                <div className="mb-6 relative">
                    <div className="absolute inset-0 bg-green-100 rounded-full blur-xl opacity-20 animate-pulse"></div>
                    <span className="text-6xl relative z-10 drop-shadow-sm">🍃</span>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3 tracking-tight">想法脱钩练习</h3>
                <p className="text-slate-600 text-sm max-w-[280px] mb-8 leading-relaxed font-medium">
                    想象你正坐在一条缓缓流淌的小溪边。<br />
                    对于头脑中出现的每一个想法 —— <br />
                    无论好坏，都把它放在树叶上，<br />
                    看着它顺流而下。
                </p>
                <button
                    onClick={handleStart}
                    className="px-8 py-3 bg-[#4caf50] text-white rounded-full text-[15px] font-bold shadow-lg shadow-green-500/20 hover:bg-[#43a047] hover:shadow-green-500/30 hover:scale-105 active:scale-95 transition-all"
                >
                    开始练习
                </button>
            </div>
        );
    }

    return (
        <div className="relative h-[480px] rounded-xl overflow-hidden mb-2 border border-teal-100 shadow-inner group select-none bg-[#e0f7fa]">
            {/* Exquisite Water Background */}
            <div className="absolute inset-0 z-0 w-full h-full overflow-hidden">
                {/* Base Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-teal-50 to-blue-50"></div>

                {/* Layer 1: Slow Deep Current (Left to Right) */}
                <div className="absolute bottom-[-20%] left-0 w-[200%] h-[150%] flex opacity-40 animate-[wave-flow_15s_linear_infinite] will-change-transform">
                    {/* Render identical SVG twice for seamless loop */}
                    <div className="w-1/2 h-full">
                        <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                            <path fill="#b2ebf2" d="M0,192 C480,250 960,150 1440,192 V320 H0 Z"></path>
                        </svg>
                    </div>
                    <div className="w-1/2 h-full">
                        <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                            <path fill="#b2ebf2" d="M0,192 C480,250 960,150 1440,192 V320 H0 Z"></path>
                        </svg>
                    </div>
                </div>

                {/* Layer 2: Surface Ripples (Left to Right, Faster) */}
                <div className="absolute bottom-[-30%] left-0 w-[200%] h-[150%] flex opacity-30 animate-[wave-flow_10s_linear_infinite] will-change-transform">
                    <div className="w-1/2 h-full">
                        <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                            <path fill="#4dd0e1" d="M0,128 C360,160 1080,96 1440,128 V320 H0 Z"></path>
                        </svg>
                    </div>
                    <div className="w-1/2 h-full">
                        <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                            <path fill="#4dd0e1" d="M0,128 C360,160 1080,96 1440,128 V320 H0 Z"></path>
                        </svg>
                    </div>
                </div>

                {/* Layer 3: Sun Glimmer Overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.8),transparent_70%)] opacity-60 pointer-events-none mix-blend-soft-light"></div>
            </div>

            <style jsx>{`
                @keyframes wave-flow {
                    0% { transform: translate3d(-50%, 0, 0); } 
                    100% { transform: translate3d(0, 0, 0); }
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
    // Slower, majestic, linear flow
    const flowDuration = 15 + Math.random() * 5;
    // Independent bobbing (breathing) cycle
    const bobDuration = 2 + Math.random() * 1;

    // Y-position: Float in the "middle" stream (40% - 60% of height), avoid sinking behind input
    const randomYStart = 180 + Math.random() * 60; // Start range ~40%
    const randomYEnd = randomYStart + 60; // Mild downstream drift

    return (
        <motion.div
            initial={{
                x: -150,
                y: randomYStart,
                opacity: 0,
                scale: 0.8
            }}
            animate={{
                x: ["-20%", "120%"],
                y: [randomYStart, randomYEnd],
                opacity: [0, 1, 1, 1, 0],
                rotate: [-5, 5] // Rotation driven by bobbing below
            }}
            transition={{
                duration: flowDuration,
                ease: "linear",
                opacity: { duration: flowDuration, times: [0, 0.1, 0.9, 1] }
            }}
            onAnimationComplete={onComplete}
            className="absolute top-0 left-0" // Removed fixed width/height constraint to allow free movement
        >
            {/* Bobbing Motion Wrapper (Simulating Buoyancy) */}
            <motion.div
                animate={{
                    y: [0, -8, 0], // Bobbing up and down
                    rotate: [-3, 3, -3] // Rocking
                }}
                transition={{
                    duration: bobDuration,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            >
                {/* Refined Exquisite Leaf Size: w-48 -> w-32 */}
                <div className="relative w-32 h-20 flex items-center justify-center">
                    {/* Leaf SVG: High Fidelity */}
                    <svg viewBox="0 0 120 60" className="absolute w-full h-full drop-shadow-lg" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,50,30,0.2))' }}>
                        <defs>
                            <linearGradient id="leafGradient" x1="0%" y1="0%" x2="100%" y2="50%">
                                <stop offset="0%" stopColor="#81c784" />
                                <stop offset="100%" stopColor="#43a047" />
                            </linearGradient>
                            {/* Water reflection highlight on leaf */}
                            <linearGradient id="leafShine" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                                <stop offset="100%" stopColor="transparent" />
                            </linearGradient>
                        </defs>

                        {/* Main Body */}
                        <path d="M5,30 Q35,-5 65,5 Q95,15 115,30 Q95,45 65,55 Q35,65 5,30 Z" fill="url(#leafGradient)" />

                        {/* Upper Shine */}
                        <path d="M10,28 Q35,0 65,10" stroke="url(#leafShine)" strokeWidth="2" fill="none" opacity="0.6" />

                        {/* Veins - Delicate White */}
                        <path d="M5,30 C35,30 85,30 115,30" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
                        <g stroke="rgba(255,255,255,0.2)" strokeWidth="0.5">
                            <path d="M35,30 L45,15" /> <path d="M35,30 L45,45" />
                            <path d="M65,30 L75,15" /> <path d="M65,30 L75,45" />
                            <path d="M90,30 L98,20" /> <path d="M90,30 L98,40" />
                        </g>
                    </svg>

                    {/* Text - Scaled and Centered */}
                    <div className="relative z-10 w-24 px-1 text-center flex items-center justify-center transform -rotate-1 pb-0.5">
                        <span className="text-[11px] font-bold text-white tracking-widest drop-shadow-md select-none line-clamp-1">
                            {leaf.text}
                        </span>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    )
}
