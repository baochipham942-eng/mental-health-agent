'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function BreathingExercise() {
    const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale' | 'ready'>('ready');
    const [cycleCount, setCycleCount] = useState(0);
    const [isRunning, setIsRunning] = useState(false);

    // 4-7-8 呼吸法节奏 (毫秒)
    // 为了初学者体验，稍微缩短 Hold 时间：吸气 4s - 屏气 4s - 呼气 6s
    const DURATION_INHALE = 4000;
    const DURATION_HOLD = 4000;
    const DURATION_EXHALE = 6000;

    useEffect(() => {
        if (!isRunning) return;

        let timeoutId: NodeJS.Timeout;

        const runCycle = () => {
            // 1. 吸气
            setPhase('inhale');

            timeoutId = setTimeout(() => {
                // 2. 屏气
                setPhase('hold');

                timeoutId = setTimeout(() => {
                    // 3. 呼气
                    setPhase('exhale');

                    timeoutId = setTimeout(() => {
                        setCycleCount(c => c + 1);
                        // 循环继续
                        runCycle();
                    }, DURATION_EXHALE);
                }, DURATION_HOLD);
            }, DURATION_INHALE);
        };

        runCycle();

        return () => clearTimeout(timeoutId);
    }, [isRunning]);

    const handleStart = () => {
        setIsRunning(true);
        setCycleCount(0);
    };

    const handleStop = () => {
        setIsRunning(false);
        setPhase('ready');
    };

    const getInstructionText = () => {
        switch (phase) {
            case 'inhale': return '慢慢吸气...';
            case 'hold': return '保持...';
            case 'exhale': return '缓缓呼气...';
            default: return '准备好了吗？';
        }
    };

    // 动画变体
    const circleVariants: any = {
        ready: { scale: 1, opacity: 0.8 },
        inhale: { scale: 1.5, opacity: 1, transition: { duration: DURATION_INHALE / 1000, ease: "easeInOut" } },
        hold: { scale: 1.5, opacity: 1, transition: { duration: DURATION_HOLD / 1000, ease: "linear" } },
        exhale: { scale: 1, opacity: 0.6, transition: { duration: DURATION_EXHALE / 1000, ease: "easeInOut" } },
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white rounded-xl border border-blue-100">
            <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                {/* 外圈光晕 */}
                <motion.div
                    className="absolute inset-0 bg-blue-200 rounded-full blur-xl"
                    variants={circleVariants}
                    animate={phase}
                    initial="ready"
                />

                {/* 核心呼吸球 */}
                <motion.div
                    className="relative w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full shadow-lg flex items-center justify-center z-10"
                    variants={circleVariants}
                    animate={phase}
                    initial="ready"
                >
                    <span className="text-white font-medium text-sm">
                        {phase === 'inhale' ? '吸' : phase === 'exhale' ? '呼' : phase === 'hold' ? '停' : '开始'}
                    </span>
                </motion.div>
            </div>

            <div className="text-center space-y-4 z-10">
                <h3 className="text-xl font-bold text-gray-800 min-h-[2rem]">
                    {getInstructionText()}
                </h3>

                <p className="text-sm text-gray-500 min-h-[1.5rem]">
                    {isRunning ? `已完成 ${cycleCount} 次呼吸` : '跟随圆圈的大小调节呼吸'}
                </p>

                <button
                    onClick={isRunning ? handleStop : handleStart}
                    className={`px-6 py-2 rounded-full font-medium transition-colors ${isRunning
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                >
                    {isRunning ? '结束练习' : '开始呼吸'}
                </button>
            </div>
        </div>
    );
}
