'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BreathingExerciseProps {
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
        console.warn('[Breathing] Could not play completion sound:', e);
    }
}

export function BreathingExercise({ onComplete, setHeaderControl, onStart }: BreathingExerciseProps) {
    const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale' | 'ready'>('ready');
    const [cycleCount, setCycleCount] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(null);
    const ambientRef = useRef<AmbientSound | null>(null);

    // 4-7-8 呼吸法节奏 (毫秒)
    // 为了初学者体验，稍微缩短 Hold 时间：吸气 4s - 屏气 4s - 呼气 6s
    const DURATION_INHALE = 4000;
    const DURATION_HOLD = 4000;
    const DURATION_EXHALE = 6000;

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
        setCycleCount(0);
        setStartTime(Date.now());
        if (onStart) onStart();
    };

    const handleStop = () => {
        setIsRunning(false);
        setPhase('ready');
        // 播放结束提示音，让闭眼的用户知道练习结束
        playCompletionSound();
        if (onComplete && startTime) {
            const duration = Math.round((Date.now() - startTime) / 1000);
            onComplete(duration);
        }
    };

    // 将控制按钮注入到 Header
    useEffect(() => {
        if (!setHeaderControl) return;

        const controls = (
            <button
                onClick={isRunning ? handleStop : handleStart}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${isRunning
                    ? cycleCount >= 4
                        ? 'bg-green-500 text-white hover:bg-green-600 animate-pulse' // 达标: 绿色
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'  // 未达标: 灰色/提前结束
                    : 'bg-blue-600 text-white hover:bg-blue-700'        // 未开始: 蓝色
                    }`}
            >
                {isRunning
                    ? (cycleCount >= 4 ? '完成练习' : '提前结束')
                    : '开始呼吸'
                }
            </button>
        );

        setHeaderControl(controls);

        // Cleanup: remove controls when unmounting (or leave it to parent to handle)
        // return () => setHeaderControl(null); 
    }, [isRunning, cycleCount, setHeaderControl]);


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
        <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white rounded-xl border border-blue-100 min-h-[300px]">
            <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                {/* 外圈光晕 */}
                <motion.div
                    className="absolute inset-0 bg-blue-200 rounded-full blur-xl"
                    variants={circleVariants}
                    animate={phase}
                    initial="ready"
                />

                {/* 核心呼吸球 - 点击可开始 */}
                <motion.div
                    className={`relative w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full shadow-lg flex items-center justify-center z-10 ${!isRunning ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                    variants={circleVariants}
                    animate={phase}
                    initial="ready"
                    onClick={() => !isRunning && handleStart()}
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
                    {isRunning ? (
                        <span>
                            第 <span className="font-bold text-blue-600">{cycleCount + 1}</span> / 4 组循环
                        </span>
                    ) : (
                        '跟随圆圈的大小调节呼吸，建议完成 4 组'
                    )}
                </p>

                {/* 底部按钮已移除，现在通过 Header 控制 */}
            </div>
        </div>
    );
}
