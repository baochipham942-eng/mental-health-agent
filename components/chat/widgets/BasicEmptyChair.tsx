'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BasicEmptyChairProps {
    onComplete: (duration: number) => void;
    setHeaderControl: (node: React.ReactNode) => void;
    onStart: () => void;
}

type Stage = 'setup' | 'speak_to' | 'switch' | 'speak_as' | 'reflection';

// 阶段配色 — 随情绪流动变化
const STAGE_THEMES = {
    setup:      { bg: 'from-amber-50 via-orange-50/40 to-stone-50',   accent: 'amber',  glow: 'bg-amber-200/30' },
    speak_to:   { bg: 'from-rose-50 via-pink-50/30 to-stone-50',      accent: 'rose',    glow: 'bg-rose-200/30' },
    switch:     { bg: 'from-indigo-50 via-violet-50/30 to-stone-50',   accent: 'indigo',  glow: 'bg-indigo-200/30' },
    speak_as:   { bg: 'from-teal-50 via-emerald-50/30 to-stone-50',   accent: 'teal',    glow: 'bg-teal-200/30' },
    reflection: { bg: 'from-violet-50 via-purple-50/30 to-stone-50',   accent: 'violet',  glow: 'bg-violet-200/30' },
};

// 进度指示器配置
const STAGE_STEPS: { key: Stage; label: string }[] = [
    { key: 'setup',      label: '邀请' },
    { key: 'speak_to',   label: '倾诉' },
    { key: 'switch',     label: '互换' },
    { key: 'speak_as',   label: '回应' },
    { key: 'reflection', label: '完成' },
];

export function BasicEmptyChair({ onComplete, setHeaderControl, onStart }: BasicEmptyChairProps) {
    const [stage, setStage] = useState<Stage>('setup');
    const [targetName, setTargetName] = useState('');
    const [userContent, setUserContent] = useState('');
    const [targetContent, setTargetContent] = useState('');
    const startTimeRef = useRef(0);
    const hasStartedRef = useRef(false);

    useEffect(() => {
        if (!hasStartedRef.current) {
            onStart();
            startTimeRef.current = Date.now();
            hasStartedRef.current = true;
        }
    }, [onStart]);

    // Header controls
    useEffect(() => {
        if (stage === 'setup') {
            setHeaderControl(null);
        } else if (stage === 'reflection') {
            setHeaderControl(
                <button
                    onClick={() => onComplete(Math.round((Date.now() - startTimeRef.current) / 1000))}
                    className="px-4 py-1.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-full text-xs font-semibold shadow-md shadow-violet-200/50 hover:shadow-lg transition-all"
                >
                    完成练习
                </button>
            );
        } else {
            setHeaderControl(
                <button
                    onClick={() => onComplete(Math.round((Date.now() - startTimeRef.current) / 1000))}
                    className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-full text-xs font-medium hover:bg-gray-50 hover:text-violet-600 transition-colors"
                >
                    结束练习
                </button>
            );
        }
    }, [stage, setHeaderControl, onComplete]);

    const handleSetupSubmit = () => {
        if (!targetName.trim()) return;
        setStage('speak_to');
    };

    const handleSpeakToSubmit = () => {
        if (!userContent.trim()) return;
        setStage('switch');
    };

    const handleSwitchReady = () => {
        setStage('speak_as');
    };

    const handleSpeakAsSubmit = () => {
        if (!targetContent.trim()) return;
        setStage('reflection');
    };

    const theme = STAGE_THEMES[stage];
    const currentStepIdx = STAGE_STEPS.findIndex(s => s.key === stage);

    return (
        <div className="relative rounded-2xl overflow-hidden select-none">
            {/* 背景渐变 — 随阶段变色 */}
            <motion.div
                key={stage}
                className={`absolute inset-0 bg-gradient-to-b ${theme.bg}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
            />

            {/* 氛围光晕 */}
            <div className={`absolute top-[-30%] right-[-20%] w-72 h-72 ${theme.glow} rounded-full blur-3xl`} />
            <div className={`absolute bottom-[-20%] left-[-15%] w-56 h-56 ${theme.glow} rounded-full blur-3xl opacity-50`} />

            {/* 进度条 */}
            {stage !== 'setup' && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative z-10 flex items-center justify-center gap-1.5 pt-4 pb-1 px-6"
                >
                    {STAGE_STEPS.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-1.5">
                            <div className="flex flex-col items-center gap-1">
                                <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                                    i < currentStepIdx ? 'bg-violet-400 scale-100'
                                    : i === currentStepIdx ? 'bg-violet-500 scale-125 ring-4 ring-violet-200/50'
                                    : 'bg-gray-200 scale-100'
                                }`} />
                                <span className={`text-[10px] transition-colors duration-500 ${
                                    i <= currentStepIdx ? 'text-violet-500 font-medium' : 'text-gray-300'
                                }`}>{step.label}</span>
                            </div>
                            {i < STAGE_STEPS.length - 1 && (
                                <div className={`w-6 h-[1px] mb-4 transition-colors duration-500 ${
                                    i < currentStepIdx ? 'bg-violet-300' : 'bg-gray-200'
                                }`} />
                            )}
                        </div>
                    ))}
                </motion.div>
            )}

            {/* 内容区 */}
            <div className="relative z-10 px-6 pb-6 pt-2 min-h-[320px] flex flex-col justify-center items-center">
                <AnimatePresence mode="wait">
                    {/* ── 设置阶段 ── */}
                    {stage === 'setup' && (
                        <motion.div
                            key="setup"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                            className="w-full max-w-sm text-center"
                        >
                            {/* 椅子插画 */}
                            <div className="relative mb-6 flex justify-center">
                                <motion.div
                                    className="relative"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                    <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center text-4xl shadow-lg shadow-amber-100/50 border border-amber-200/30">
                                        🪑
                                    </div>
                                    {/* 柔光 */}
                                    <div className="absolute -inset-3 bg-amber-200/20 rounded-3xl blur-xl -z-10" />
                                </motion.div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-700 mb-2">空椅子对话</h3>
                            <p className="text-[13px] text-slate-400 leading-[1.8] mb-6">
                                想象面前有一把空椅子<br />
                                你想邀请谁坐在这里？<br />
                                <span className="text-slate-300">可以是某个人，或者过去的自己</span>
                            </p>

                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={targetName}
                                    onChange={(e) => setTargetName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                            e.preventDefault();
                                            handleSetupSubmit();
                                        }
                                    }}
                                    placeholder="例如：我的父亲 / 高中的自己"
                                    className="w-full px-4 py-3 rounded-xl bg-white/80 backdrop-blur-sm border border-amber-200/50 text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-300/40 focus:border-amber-300/60 text-center text-[14px] transition-all"
                                    autoFocus
                                />
                                <button
                                    onClick={handleSetupSubmit}
                                    disabled={!targetName.trim()}
                                    className="w-full py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-300 bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-lg shadow-amber-200/50 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
                                >
                                    邀请入座
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* ── 对 TA 说 ── */}
                    {stage === 'speak_to' && (
                        <motion.div
                            key="speak_to"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                            transition={{ duration: 0.4 }}
                            className="w-full max-w-sm"
                        >
                            {/* 角色指示 */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-9 h-9 bg-gradient-to-br from-rose-100 to-pink-100 rounded-full flex items-center justify-center text-base shadow-sm border border-rose-200/30">
                                    🫵
                                </div>
                                <div className="flex-1">
                                    <div className="text-[13px] font-semibold text-rose-600">你 → {targetName}</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">把藏在心里的话说出来</div>
                                </div>
                            </div>

                            <textarea
                                value={userContent}
                                onChange={(e) => setUserContent(e.target.value)}
                                className="w-full h-36 px-4 py-3 rounded-xl bg-white/70 backdrop-blur-sm border border-rose-200/40 text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-200/40 focus:border-rose-300/50 resize-none text-[14px] leading-relaxed transition-all"
                                placeholder="我想对你说……"
                                autoFocus
                            />

                            <div className="flex justify-end mt-3">
                                <button
                                    onClick={handleSpeakToSubmit}
                                    disabled={!userContent.trim()}
                                    className="px-5 py-2 rounded-xl text-[13px] font-semibold transition-all bg-gradient-to-r from-rose-400 to-pink-400 text-white shadow-md shadow-rose-200/40 hover:shadow-lg active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    说完了
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* ── 角色互换 ── */}
                    {stage === 'switch' && (
                        <motion.div
                            key="switch"
                            initial={{ opacity: 0, scale: 0.9, rotateY: 60 }}
                            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                            exit={{ opacity: 0, scale: 0.9, rotateY: -60 }}
                            transition={{ duration: 0.6, ease: [0.2, 0, 0.2, 1] }}
                            className="text-center max-w-xs"
                        >
                            {/* 旋转动画图标 */}
                            <motion.div
                                className="mb-6 inline-flex"
                                animate={{ rotate: [0, 180, 360] }}
                                transition={{ duration: 2, ease: 'easeInOut' }}
                            >
                                <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center shadow-lg shadow-indigo-100/50 border border-indigo-200/30">
                                    <span className="text-3xl">🔄</span>
                                </div>
                            </motion.div>

                            <h3 className="text-lg font-bold text-slate-700 mb-3">角色互换</h3>
                            <p className="text-[13px] text-slate-400 leading-[1.8] mb-6">
                                深呼吸，在心里走到对面<br />
                                <b className="text-indigo-500">坐到那把椅子上</b><br />
                                <br />
                                此刻，你是 <b className="text-indigo-600">{targetName}</b>
                            </p>

                            <button
                                onClick={handleSwitchReady}
                                className="px-8 py-3 rounded-full text-[14px] font-semibold transition-all duration-300 bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:scale-[1.03] active:scale-[0.97]"
                            >
                                我准备好了
                            </button>
                        </motion.div>
                    )}

                    {/* ── 作为 TA 回应 ── */}
                    {stage === 'speak_as' && (
                        <motion.div
                            key="speak_as"
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 30 }}
                            transition={{ duration: 0.4 }}
                            className="w-full max-w-sm"
                        >
                            {/* 角色指示 — 反向 */}
                            <div className="flex items-center gap-3 mb-4 flex-row-reverse">
                                <div className="w-9 h-9 bg-gradient-to-br from-teal-100 to-emerald-100 rounded-full flex items-center justify-center text-base shadow-sm border border-teal-200/30">
                                    💬
                                </div>
                                <div className="flex-1 text-right">
                                    <div className="text-[13px] font-semibold text-teal-600">{targetName} → 你</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">听到这些，你想说什么？</div>
                                </div>
                            </div>

                            <textarea
                                value={targetContent}
                                onChange={(e) => setTargetContent(e.target.value)}
                                className="w-full h-36 px-4 py-3 rounded-xl bg-white/70 backdrop-blur-sm border border-teal-200/40 text-slate-600 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-200/40 focus:border-teal-300/50 resize-none text-[14px] leading-relaxed transition-all"
                                placeholder="其实我想说……"
                                autoFocus
                            />

                            <div className="flex justify-start mt-3">
                                <button
                                    onClick={handleSpeakAsSubmit}
                                    disabled={!targetContent.trim()}
                                    className="px-5 py-2 rounded-xl text-[13px] font-semibold transition-all bg-gradient-to-r from-teal-400 to-emerald-400 text-white shadow-md shadow-teal-200/40 hover:shadow-lg active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    结束对话
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* ── 完成反思 ── */}
                    {stage === 'reflection' && (
                        <motion.div
                            key="reflection"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6 }}
                            className="text-center max-w-xs"
                        >
                            <motion.div
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                className="mb-6 inline-flex"
                            >
                                <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-purple-100 rounded-full flex items-center justify-center shadow-lg shadow-violet-100/50 border border-violet-200/30">
                                    <span className="text-3xl">🕊️</span>
                                </div>
                            </motion.div>

                            <h3 className="text-lg font-bold text-slate-700 mb-3">练习完成</h3>
                            <p className="text-[13px] text-slate-400 leading-[1.8] mb-6">
                                深呼吸，慢慢回到自己的身体里<br />
                                <br />
                                刚才的对话可能并不完美<br />
                                但你已经迈出了勇敢的一步
                            </p>

                            <div className="bg-white/60 backdrop-blur-sm rounded-xl px-4 py-3 border border-violet-100/50 text-[12px] text-slate-400 inline-block">
                                点击右上角 <b className="text-violet-500">完成练习</b> 记录你的感受
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
