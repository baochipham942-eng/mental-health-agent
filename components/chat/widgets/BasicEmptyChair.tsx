import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BasicEmptyChairProps {
    onComplete: (duration: number) => void;
    setHeaderControl: (node: React.ReactNode) => void;
    onStart: () => void;
}

type Stage = 'setup' | 'speak_to' | 'switch' | 'speak_as' | 'reflection';

export function BasicEmptyChair({ onComplete, setHeaderControl, onStart }: BasicEmptyChairProps) {
    const [stage, setStage] = useState<Stage>('setup');
    const [targetName, setTargetName] = useState('');
    const [userContent, setUserContent] = useState('');
    const [targetContent, setTargetContent] = useState('');

    const hasStartedRef = useRef(false);

    // Auto-start logger
    useEffect(() => {
        if (!hasStartedRef.current) {
            onStart();
            hasStartedRef.current = true;
        }
    }, [onStart]);

    // Header controls update
    useEffect(() => {
        if (stage === 'setup') {
            setHeaderControl(null);
        } else if (stage === 'reflection') {
            setHeaderControl(
                <button
                    onClick={() => onComplete(300)} // Assume 5 mins avg
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold animate-pulse"
                >
                    完成练习
                </button>
            );
        } else {
            setHeaderControl(
                <div className="text-xs text-gray-400 font-mono">练习进行中...</div>
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

    return (
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6 min-h-[300px] flex flex-col justify-center items-center relative overflow-hidden">

            {/* Background Decor */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-purple-400 opacity-30" />

            <AnimatePresence mode="wait">
                {stage === 'setup' && (
                    <motion.div
                        key="setup"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="w-full max-w-sm"
                    >
                        <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">空椅子技术：设置</h3>
                        <p className="text-sm text-gray-600 mb-4 text-center">
                            想象你面前有一把空椅子。<br />你想邀请谁坐在这里？<br />
                            (可以是伤害你的人、离开的人、或者是"过去的自己")
                        </p>
                        <input
                            type="text"
                            value={targetName}
                            onChange={(e) => setTargetName(e.target.value)}
                            placeholder="例如：我的父亲 / 高中的自己"
                            className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-200 outline-none mb-4 text-center"
                        />
                        <button
                            onClick={handleSetupSubmit}
                            disabled={!targetName.trim()}
                            className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-purple-700 transition-colors"
                        >
                            确定邀请
                        </button>
                    </motion.div>
                )}

                {stage === 'speak_to' && (
                    <motion.div
                        key="speak_to"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="w-full"
                    >
                        <div className="flex items-center gap-2 mb-2 text-purple-700 font-bold">
                            <span>👤 你</span>
                            <span className="text-gray-300">→</span>
                            <span>🪑 {targetName}</span>
                        </div>
                        <p className="text-sm text-gray-500 mb-3">
                            看着椅子上的{targetName}，把你一直藏在心里没说出的委屈、愤怒或遗憾，全部说出来。
                        </p>
                        <textarea
                            value={userContent}
                            onChange={(e) => setUserContent(e.target.value)}
                            className="w-full h-32 p-3 rounded-lg border border-purple-100 bg-white focus:ring-2 focus:ring-purple-200 outline-none resize-none mb-3"
                            placeholder="我想告诉你..."
                            autoFocus
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={handleSpeakToSubmit}
                                disabled={!userContent.trim()}
                                className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium text-sm"
                            >
                                说完了，下一步
                            </button>
                        </div>
                    </motion.div>
                )}

                {stage === 'switch' && (
                    <motion.div
                        key="switch"
                        initial={{ opacity: 0, rotateY: 90 }}
                        animate={{ opacity: 1, rotateY: 0 }}
                        exit={{ opacity: 0, rotateY: -90 }}
                        className="text-center max-w-xs"
                    >
                        <div className="text-4xl mb-4">🔄</div>
                        <h3 className="text-lg font-bold text-gray-800 mb-2">角色互换</h3>
                        <p className="text-sm text-gray-600 mb-6">
                            现在，请你站起来（或在心里），<br />
                            <b>坐到那把椅子上</b>。<br />
                            <br />
                            此时此刻，你不再是你自己。<br />
                            你是 <b>{targetName}</b>。
                        </p>
                        <button
                            onClick={handleSwitchReady}
                            className="px-8 py-3 bg-gray-800 text-white rounded-full font-bold shadow-lg hover:scale-105 transition-transform"
                        >
                            我已准备好
                        </button>
                    </motion.div>
                )}

                {stage === 'speak_as' && (
                    <motion.div
                        key="speak_as"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="w-full"
                    >
                        <div className="flex items-center gap-2 mb-2 text-gray-600 font-bold justify-end">
                            <span>👤 你 ({targetName})</span>
                            <span className="text-gray-300">→</span>
                            <span>🪑 那个受伤的你</span>
                        </div>
                        <p className="text-sm text-gray-500 mb-3 text-right">
                            作为{targetName}，听到刚才那些话，你想对对面的"你"说什么？<br />(试着去解释，或者道歉)
                        </p>
                        <textarea
                            value={targetContent}
                            onChange={(e) => setTargetContent(e.target.value)}
                            className="w-full h-32 p-3 rounded-lg border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-gray-200 outline-none resize-none mb-3 text-right"
                            placeholder="其实..."
                            autoFocus
                        />
                        <div className="flex justify-start">
                            <button
                                onClick={handleSpeakAsSubmit}
                                disabled={!targetContent.trim()}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm"
                            >
                                结束对话
                            </button>
                        </div>
                    </motion.div>
                )}

                {stage === 'reflection' && (
                    <motion.div
                        key="reflection"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                            🕊️
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-2">练习结束</h3>
                        <p className="text-sm text-gray-600 mb-6 max-w-xs mx-auto">
                            深呼吸...<br />
                            慢慢回到你自己的身体里。<br />
                            <br />
                            刚才的对话可能并不完美，<br />但你已经迈出了勇敢的一步。
                        </p>
                        <div className="text-xs text-gray-400 p-3 bg-white rounded border border-gray-100 inline-block">
                            点击右上角的 <b>完成练习</b> 记录你的感受
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
