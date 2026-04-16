'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { playCompletionSound } from '@/lib/utils/ambient-sound';
import { useAmbientSound } from '@/hooks/useAmbientSound';
import { AmbientSoundControl } from './AmbientSoundControl';

interface MeditationExerciseProps {
    onComplete?: (duration: number) => void;
    setHeaderControl?: (node: React.ReactNode) => void;
    onStart?: () => void;
}

export function MeditationExercise({ onComplete, setHeaderControl, onStart }: MeditationExerciseProps) {
    const [isRunning, setIsRunning] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);
    const startTimeRef = useRef<number | null>(null);
    const ambient = useAmbientSound();

    // 冥想步骤
    const steps = [
        { text: '找一个舒适的姿势坐下', duration: 10 },
        { text: '轻轻闭上眼睛', duration: 8 },
        { text: '注意你的呼吸...', duration: 15 },
        { text: '感受空气进入身体的感觉', duration: 12 },
        { text: '慢慢呼出，释放紧张', duration: 12 },
        { text: '如果思绪飘走，温柔地拉回来', duration: 15 },
        { text: '继续保持专注于呼吸...', duration: 20 },
        { text: '感受当下的平静', duration: 15 },
        { text: '准备慢慢睁开眼睛', duration: 10 },
        { text: '练习完成，感谢自己的坚持 🙏', duration: 0 },
    ];

    const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

    // 背景音与 isRunning 状态同步
    useEffect(() => {
        if (isRunning) {
            ambient.play();
        }
        return () => {
            if (!isRunning) return;
            ambient.fadeOutAndStop();
        };
    }, [isRunning]);

    const handleStart = () => {
        setIsRunning(true);
        setElapsedSeconds(0);
        setCurrentStep(0);
        startTimeRef.current = Date.now();
        if (onStart) onStart();
    };

    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const handleStop = useCallback(() => {
        setIsRunning(false);
        ambient.fadeOutAndStop();
        playCompletionSound();
        if (onCompleteRef.current && startTimeRef.current) {
            onCompleteRef.current(Math.round((Date.now() - startTimeRef.current) / 1000));
        }
    }, []);

    // 将控制按钮注入到 Header
    useEffect(() => {
        if (!setHeaderControl) return;

        if (!isRunning) {
            setHeaderControl(null);
            return;
        }

        setHeaderControl(
            <button
                onClick={handleStop}
                className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-full text-xs font-semibold hover:bg-gray-50 hover:text-violet-600 transition-colors"
            >
                结束练习
            </button>
        );
    }, [isRunning, setHeaderControl, handleStop]);

    // 计时器和步骤切换
    useEffect(() => {
        if (!isRunning) return;

        const intervalId = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);

        return () => clearInterval(intervalId);
    }, [isRunning]);

    // 根据经过时间切换步骤
    useEffect(() => {
        if (!isRunning) return;

        let accumulatedTime = 0;
        for (let i = 0; i < steps.length; i++) {
            accumulatedTime += steps[i].duration;
            if (elapsedSeconds < accumulatedTime) {
                setCurrentStep(i);
                return;
            }
        }

        // 所有步骤完成
        setCurrentStep(steps.length - 1);
        handleStop();
    }, [elapsedSeconds, isRunning]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // 动画变体 - 柔和的脉动效果
    const pulseVariants: any = {
        idle: {
            scale: 1,
            opacity: 0.6,
        },
        active: {
            scale: [1, 1.1, 1],
            opacity: [0.6, 0.8, 0.6],
            transition: {
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
            }
        },
    };

    const currentStepData = steps[currentStep];

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-linear-to-b from-purple-50 to-white rounded-xl border border-purple-100 min-h-[300px]">
            <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                {/* 外圈光晕 */}
                <motion.div
                    className="absolute inset-0 bg-purple-200 rounded-full blur-xl"
                    variants={pulseVariants}
                    animate={isRunning ? 'active' : 'idle'}
                />

                {/* 核心冥想球 */}
                <motion.div
                    className="relative w-28 h-28 bg-linear-to-br from-purple-400 to-indigo-600 rounded-full shadow-lg flex items-center justify-center z-10"
                    variants={pulseVariants}
                    animate={isRunning ? 'active' : 'idle'}
                >
                    <span className="text-white font-medium text-2xl">
                        🧘
                    </span>
                </motion.div>
            </div>

            <div className="text-center space-y-4 z-10">
                <h3 className="text-xl font-bold text-gray-800 min-h-8">
                    {isRunning ? currentStepData.text : '准备好开始正念冥想了吗？'}
                </h3>

                <p className="text-sm text-gray-500 min-h-6">
                    {isRunning ? (
                        <span>
                            已冥想 <span className="font-bold text-purple-600">{formatTime(elapsedSeconds)}</span> / 约 {formatTime(totalDuration)}
                        </span>
                    ) : (
                        '跟随引导语，专注于当下的呼吸与感受'
                    )}
                </p>

                {/* 步骤进度指示器 */}
                {isRunning && (
                    <div className="flex justify-center gap-1 mt-2">
                        {steps.map((_, idx) => (
                            <div
                                key={idx}
                                className={`w-2 h-2 rounded-full transition-colors ${idx < currentStep
                                    ? 'bg-purple-500'
                                    : idx === currentStep
                                        ? 'bg-purple-400 animate-pulse'
                                        : 'bg-gray-200'
                                    }`}
                            />
                        ))}
                    </div>
                )}

                {/* 开始按钮 */}
                {!isRunning && (
                    <button
                        onClick={handleStart}
                        className="mt-2 px-6 py-2.5 bg-linear-to-r from-purple-500 to-indigo-500 text-white rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:from-purple-600 hover:to-indigo-600 transition-all active:scale-95"
                    >
                        开始冥想
                    </button>
                )}

                {/* 环境音控制条 */}
                {isRunning && (
                    <div className="mt-3 flex justify-center">
                        <AmbientSoundControl
                            isPlaying={ambient.isPlaying}
                            soundType={ambient.soundType}
                            volume={ambient.volume}
                            onSoundTypeChange={ambient.setSoundType}
                            onVolumeChange={ambient.setVolume}
                            onMute={ambient.stop}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
