'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface MeditationExerciseProps {
    onComplete?: (duration: number) => void;
    setHeaderControl?: (node: React.ReactNode) => void;
    onStart?: () => void;
}

/**
 * 环境音管理器 - 持续播放柔和的背景音
 */
class AmbientSound {
    private audioContext: AudioContext | null = null;
    private oscillator: OscillatorNode | null = null;
    private gainNode: GainNode | null = null;
    private lfoGain: GainNode | null = null;
    private isPlaying = false;

    start() {
        if (this.isPlaying) return;

        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

            // 主音：低沉的 396Hz（解放频率）
            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.type = 'sine';
            this.oscillator.frequency.setValueAtTime(396, this.audioContext.currentTime);

            // LFO 调制 - 模拟自然的起伏
            const lfo = this.audioContext.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(0.1, this.audioContext.currentTime); // 很慢的调制

            this.lfoGain = this.audioContext.createGain();
            this.lfoGain.gain.setValueAtTime(10, this.audioContext.currentTime); // 调制深度

            lfo.connect(this.lfoGain);
            this.lfoGain.connect(this.oscillator.frequency);

            // 主增益 - 淡入
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(0.08, this.audioContext.currentTime + 2); // 柔和音量

            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            lfo.start();
            this.oscillator.start();
            this.isPlaying = true;
        } catch (e) {
            console.warn('[Ambient] Could not start ambient sound:', e);
        }
    }

    stop() {
        if (!this.isPlaying || !this.audioContext || !this.gainNode || !this.oscillator) return;

        try {
            // 淡出
            this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1);

            // 延迟停止
            setTimeout(() => {
                try {
                    this.oscillator?.stop();
                    this.audioContext?.close();
                } catch (e) { }
                this.audioContext = null;
                this.oscillator = null;
                this.gainNode = null;
                this.lfoGain = null;
                this.isPlaying = false;
            }, 1100);
        } catch (e) {
            console.warn('[Ambient] Could not stop ambient sound:', e);
        }
    }
}

/**
 * 使用 Web Audio API 播放柔和的颂钵/钟声提示音
 */
function playCompletionSound() {
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        // 创建振荡器 - 颂钵基音
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(528, audioContext.currentTime); // 528Hz - 愈合频率

        // 创建包络增益节点
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1); // 淡入
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2); // 缓慢淡出

        // 连接节点
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // 播放
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 2);

        // 清理
        oscillator.onended = () => {
            audioContext.close();
        };
    } catch (e) {
        console.warn('[Meditation] Could not play completion sound:', e);
    }
}

export function MeditationExercise({ onComplete, setHeaderControl, onStart }: MeditationExerciseProps) {
    const [isRunning, setIsRunning] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);
    const startTimeRef = useRef<number | null>(null);
    const ambientRef = useRef<AmbientSound | null>(null);

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
            if (!ambientRef.current) {
                ambientRef.current = new AmbientSound();
            }
            ambientRef.current.start();
        } else {
            ambientRef.current?.stop();
        }

        // 组件卸载时清理
        return () => {
            ambientRef.current?.stop();
        };
    }, [isRunning]);

    const handleStart = () => {
        setIsRunning(true);
        setElapsedSeconds(0);
        setCurrentStep(0);
        startTimeRef.current = Date.now();
        if (onStart) onStart();
    };

    const handleStop = () => {
        setIsRunning(false);
        // 播放结束提示音，让闭眼的用户知道练习结束
        playCompletionSound();
        if (onComplete && startTimeRef.current) {
            const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
            onComplete(duration);
        }
    };

    // 将控制按钮注入到 Header
    useEffect(() => {
        if (!setHeaderControl) return;

        const isComplete = currentStep >= steps.length - 1 && !isRunning;

        const controls = (
            <button
                onClick={isRunning ? handleStop : handleStart}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${isRunning
                    ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    : isComplete
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
            >
                {isRunning ? '停止冥想' : isComplete ? '完成练习' : '开始冥想'}
            </button>
        );

        setHeaderControl(controls);
    }, [isRunning, currentStep, setHeaderControl]);

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
        <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-purple-50 to-white rounded-xl border border-purple-100 min-h-[300px]">
            <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                {/* 外圈光晕 */}
                <motion.div
                    className="absolute inset-0 bg-purple-200 rounded-full blur-xl"
                    variants={pulseVariants}
                    animate={isRunning ? 'active' : 'idle'}
                />

                {/* 核心冥想球 */}
                <motion.div
                    className="relative w-28 h-28 bg-gradient-to-br from-purple-400 to-indigo-600 rounded-full shadow-lg flex items-center justify-center z-10"
                    variants={pulseVariants}
                    animate={isRunning ? 'active' : 'idle'}
                >
                    <span className="text-white font-medium text-2xl">
                        🧘
                    </span>
                </motion.div>
            </div>

            <div className="text-center space-y-4 z-10">
                <h3 className="text-xl font-bold text-gray-800 min-h-[2rem]">
                    {isRunning ? currentStepData.text : '准备好开始正念冥想了吗？'}
                </h3>

                <p className="text-sm text-gray-500 min-h-[1.5rem]">
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
            </div>
        </div>
    );
}
