'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AmbientSound, playCompletionSound } from '@/lib/utils/ambient-sound';

interface BreathingExerciseProps {
    onComplete?: (duration: number) => void;
    setHeaderControl?: (node: React.ReactNode) => void;
    onStart?: () => void;
}

// 阶段配色
const PHASE_COLORS = {
    ready:  { ring: 'from-sky-200 to-blue-200', core: 'from-sky-300 to-blue-400', glow: 'bg-sky-200/40',  text: 'text-sky-600' },
    inhale: { ring: 'from-sky-300 to-blue-300', core: 'from-sky-400 to-blue-500', glow: 'bg-sky-300/50',  text: 'text-sky-700' },
    hold:   { ring: 'from-violet-200 to-indigo-200', core: 'from-violet-400 to-indigo-500', glow: 'bg-violet-200/40', text: 'text-violet-600' },
    exhale: { ring: 'from-teal-200 to-emerald-200', core: 'from-teal-300 to-emerald-400', glow: 'bg-teal-200/40',  text: 'text-teal-600' },
};

export function BreathingExercise({ onComplete, setHeaderControl, onStart }: BreathingExerciseProps) {
    const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale' | 'ready'>('ready');
    const [cycleCount, setCycleCount] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);
    const ambientRef = useRef<AmbientSound | null>(null);

    // 4-4-6 呼吸法节奏（初学者友好版）
    const DURATION_INHALE = 4000;
    const DURATION_HOLD = 4000;
    const DURATION_EXHALE = 6000;

    useEffect(() => {
        if (isRunning) {
            if (!ambientRef.current) {
                ambientRef.current = new AmbientSound();
            }
            ambientRef.current.start();
        } else {
            ambientRef.current?.stop();
        }
        return () => { ambientRef.current?.stop(); };
    }, [isRunning]);

    const handleStart = () => {
        setIsRunning(true);
        setCycleCount(0);
        setStartTime(Date.now());
        if (onStart) onStart();
    };

    // 用 ref 保存最新的 stop 逻辑，避免 header 按钮闭包过期
    const startTimeRef = useRef(startTime);
    startTimeRef.current = startTime;
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const handleStop = useCallback(() => {
        setIsRunning(false);
        setPhase('ready');
        playCompletionSound();
        if (onCompleteRef.current && startTimeRef.current) {
            onCompleteRef.current(Math.round((Date.now() - startTimeRef.current) / 1000));
        }
    }, []);

    // Header 控制按钮
    useEffect(() => {
        if (!setHeaderControl) return;

        if (!isRunning) {
            setHeaderControl(null);
            return;
        }

        setHeaderControl(
            <button
                onClick={handleStop}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    cycleCount >= 4
                        ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-white shadow-md shadow-emerald-200/50'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-violet-600'
                }`}
            >
                {cycleCount >= 4 ? '完成练习' : '结束练习'}
            </button>
        );
    }, [isRunning, cycleCount, setHeaderControl, handleStop]);

    // 呼吸循环
    useEffect(() => {
        if (!isRunning) return;

        let timeoutId: NodeJS.Timeout;
        const runCycle = () => {
            setPhase('inhale');
            timeoutId = setTimeout(() => {
                setPhase('hold');
                timeoutId = setTimeout(() => {
                    setPhase('exhale');
                    timeoutId = setTimeout(() => {
                        setCycleCount(c => c + 1);
                        runCycle();
                    }, DURATION_EXHALE);
                }, DURATION_HOLD);
            }, DURATION_INHALE);
        };
        runCycle();
        return () => clearTimeout(timeoutId);
    }, [isRunning]);

    const colors = PHASE_COLORS[phase];

    // 动画参数
    const breatheVariants = {
        ready:  { scale: 1,   transition: { duration: 0.5 } },
        inhale: { scale: 1.5, transition: { duration: DURATION_INHALE / 1000, ease: 'easeInOut' as const } },
        hold:   { scale: 1.5, transition: { duration: DURATION_HOLD / 1000, ease: 'linear' as const } },
        exhale: { scale: 1,   transition: { duration: DURATION_EXHALE / 1000, ease: 'easeInOut' as const } },
    };

    const phaseLabel = { inhale: '吸', hold: '停', exhale: '呼', ready: '' }[phase];
    const phaseText = { inhale: '慢慢吸气…', hold: '屏住呼吸…', exhale: '缓缓呼气…', ready: '' }[phase];

    // ========================
    // 引导页
    // ========================
    if (!isRunning) {
        return (
            <div className="relative flex flex-col items-center justify-center h-[340px] px-6 text-center select-none overflow-hidden">
                {/* 背景 */}
                <div className="absolute inset-0 bg-gradient-to-b from-sky-100 via-blue-50 to-white" />
                {/* 装饰光晕 */}
                <div className="absolute top-[-10%] right-[-10%] w-48 h-48 bg-sky-200/30 rounded-full blur-3xl" />
                <div className="absolute bottom-[-5%] left-[-10%] w-36 h-36 bg-blue-100/30 rounded-full blur-3xl" />

                <div className="relative z-10 flex flex-col items-center">
                    {/* 呼吸球预览 */}
                    <motion.div
                        className="relative mb-6"
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-300 to-blue-400 shadow-xl shadow-sky-200/50 flex items-center justify-center">
                            <div className="w-[40%] h-[35%] bg-white/30 rounded-full blur-[2px] absolute top-[18%] left-[22%]" />
                        </div>
                        <div className="absolute -inset-4 bg-sky-200/30 rounded-full blur-xl -z-10" />
                    </motion.div>

                    <h3 className="text-lg font-bold text-slate-700 mb-2">呼吸练习</h3>
                    <p className="text-[13px] text-slate-400 max-w-[220px] leading-[1.8] mb-6">
                        跟随圆圈的节奏呼吸<br />
                        吸气 4 秒 · 屏气 4 秒 · 呼气 6 秒<br />
                        <span className="text-slate-300">建议完成 4 组</span>
                    </p>

                    <button
                        onClick={handleStart}
                        className="group relative px-7 py-2.5 rounded-full text-[14px] font-semibold transition-all duration-300 bg-gradient-to-r from-sky-400 to-blue-500 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl hover:shadow-sky-200/60 hover:scale-[1.03] active:scale-[0.97]"
                    >
                        开始呼吸
                    </button>
                </div>
            </div>
        );
    }

    // ========================
    // 练习主界面
    // ========================
    return (
        <div className="relative h-[380px] rounded-2xl overflow-hidden select-none">
            {/* 动态背景 — 随阶段变色 */}
            <motion.div
                className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white"
                key={phase}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1 }}
            />

            {/* 氛围光晕 */}
            <motion.div
                className={`absolute top-[10%] left-1/2 -translate-x-1/2 w-72 h-72 ${colors.glow} rounded-full blur-3xl`}
                variants={breatheVariants}
                animate={phase}
                initial="ready"
            />

            {/* 呼吸球 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                <div className="relative w-48 h-48 flex items-center justify-center mb-8">
                    {/* 外环 — 跟随呼吸缩放 */}
                    <motion.div
                        className={`absolute inset-0 rounded-full bg-gradient-to-br ${colors.ring} opacity-40 blur-md`}
                        variants={breatheVariants}
                        animate={phase}
                        initial="ready"
                    />

                    {/* 涟漪 */}
                    <motion.div
                        className={`absolute inset-[-8px] rounded-full border-2 border-dashed ${
                            phase === 'hold' ? 'border-violet-200/40' : 'border-sky-200/40'
                        }`}
                        variants={breatheVariants}
                        animate={phase}
                        initial="ready"
                        style={{ opacity: 0.5 }}
                    />

                    {/* 核心球 */}
                    <motion.div
                        className={`relative w-28 h-28 rounded-full bg-gradient-to-br ${colors.core} shadow-2xl flex items-center justify-center z-10`}
                        variants={breatheVariants}
                        animate={phase}
                        initial="ready"
                    >
                        {/* 高光 */}
                        <div className="absolute top-[15%] left-[20%] w-[35%] h-[28%] bg-white/30 rounded-full blur-[3px]" />

                        {/* 阶段文字 */}
                        <span className="text-white text-2xl font-bold drop-shadow-sm">
                            {phaseLabel}
                        </span>
                    </motion.div>
                </div>

                {/* 引导文字 */}
                <motion.p
                    key={phase}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className={`text-base font-semibold ${colors.text} mb-2`}
                >
                    {phaseText}
                </motion.p>

                {/* 循环进度 */}
                <div className="flex items-center gap-2 mt-1">
                    {[0, 1, 2, 3].map(i => {
                        const done = i < cycleCount;
                        const current = i === cycleCount && cycleCount < 4;
                        return (
                            <motion.div
                                key={i}
                                className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                                    done ? 'bg-sky-400'
                                    : current ? 'bg-sky-300 scale-125 ring-4 ring-sky-200/40'
                                    : 'bg-gray-200'
                                }`}
                                animate={current ? { scale: [1, 1.3, 1] } : {}}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            />
                        );
                    })}
                    <span className="text-[11px] text-slate-400 ml-1">
                        {cycleCount < 4 ? `${cycleCount}/4 组` : `已完成 ${cycleCount} 组`}
                    </span>
                </div>
            </div>
        </div>
    );
}
