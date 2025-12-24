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
        <div className="relative h-[480px] bg-gradient-to-b from-teal-50 to-teal-100 rounded-xl overflow-hidden mb-2 border border-teal-100 shadow-inner group select-none">
            {/* Zen Water Background */}
            <div className="absolute inset-0 z-0">
                {/* Deep calming gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#e0f7fa] to-[#b2ebf2] opacity-50"></div>

                {/* Organic flowing waves using SVG curve */}
                <div className="absolute bottom-0 left-0 right-0 h-full opacity-30 animate-[wave-flow_15s_linear_infinite]">
                    <svg className="w-[200%] h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                        <path fill="#4dd0e1" fillOpacity="0.3" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,112C672,96,768,96,864,112C960,128,1056,160,1152,160C1248,160,1344,128,1440,112L1440,320L1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                    </svg>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-full opacity-20 animate-[wave-flow_20s_linear_infinite_reverse]" style={{ animationDelay: '-5s' }}>
                    <svg className="w-[200%] h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
                        <path fill="#26c6da" fillOpacity="0.3" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,261.3C960,256,1056,224,1152,213.3C1248,203,1344,213,1440,224L1440,320L1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                    </svg>
                </div>
            </div>

            <style jsx>{`
                @keyframes wave-flow {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>

            <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                <AnimatePresence>
                    {thoughts.map(leaf => (
                        <LeafNode key={leaf.id} leaf={leaf} onComplete={() => removeLeaf(leaf.id)} />
                    ))}
                </AnimatePresence>
            </div>

            {/* Simpler, cleaner Input Area */}
            <div className="absolute bottom-0 left-0 right-0 p-4 z-30 flex justify-center pb-6">
                <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-white/50 p-1.5 flex gap-2 w-full max-w-md transition-all hover:bg-white">
                    <input
                        type="text"
                        value={inputTitle}
                        onChange={e => setInputTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addThought()}
                        placeholder="输入念头..."
                        className="flex-1 px-4 py-2 rounded-xl bg-transparent text-gray-700 placeholder:text-gray-400 focus:outline-none text-base"
                    />
                    <button
                        onClick={addThought}
                        disabled={!inputTitle.trim()}
                        className="p-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed aspect-square flex items-center justify-center"
                    >
                        <span className="text-xl">🍃</span>
                    </button>
                </div>
            </div>

            {thoughts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 pb-20 opacity-40">
                    <span className="text-6xl text-teal-800/20 mb-2 font-serif italic">Flow</span>
                    <span className="text-teal-900/40 text-xs tracking-widest">让念头随水流去</span>
                </div>
            )}
        </div>
    );
}

function LeafNode({ leaf, onComplete }: { leaf: Leaf, onComplete: () => void }) {
    const randomDuration = 15 + Math.random() * 5;

    return (
        <motion.div
            initial={{
                x: -150,
                y: 20 + Math.random() * 40,
                rotate: -15,
                scale: 0.9,
                opacity: 0
            }}
            animate={{
                x: ["-20%", "120%"],
                y: ["5%", "80%"],
                rotate: [-15, 0, 15, 45],
                opacity: [0, 1, 1, 1, 0],
            }}
            transition={{
                duration: randomDuration,
                ease: "linear",
            }}
            onAnimationComplete={onComplete}
            className="absolute top-0 left-0 w-full"
            style={{ top: '10%' }}
        >
            {/* Much larger leaf container */}
            <div className="relative w-48 h-28 flex items-center justify-center filter drop-shadow-md">
                {/* Broader, more visible leaf shape */}
                <svg viewBox="0 0 120 60" className="absolute w-full h-full fill-emerald-500 shadow-sm" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>
                    <path d="M10,30 Q30,0 60,5 Q90,10 115,30 Q90,50 60,55 Q30,60 10,30 Z" fill="#4caf50" />
                    <path d="M10,30 L115,30" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
                    {/* Brighter highlight */}
                    <path d="M60,5 L80,15" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                </svg>

                {/* Text is critical - High contrast white on green, larger size */}
                <div className="relative z-10 w-32 px-2 text-center transform -rotate-2">
                    <span className="text-sm font-bold text-white tracking-wide leading-relaxed drop-shadow-md block w-full truncate">
                        {leaf.text}
                    </span>
                </div>
            </div>
        </motion.div>
    )
}
