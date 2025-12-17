'use client';

import { useState } from 'react';

interface PostExerciseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (score: number, feedback: string) => void;
}

export function PostExerciseModal({ isOpen, onClose, onSubmit }: PostExerciseModalProps) {
    const [step, setStep] = useState<'score' | 'feedback'>('score');
    const [score, setScore] = useState<number | null>(null);
    const [feedback, setFeedback] = useState('');

    if (!isOpen) return null;

    const handleScoreSubmit = (s: number) => {
        setScore(s);
        setStep('feedback');
    };

    const handleFinalSubmit = () => {
        if (score !== null) {
            onSubmit(score, feedback);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                <h3 className="text-lg font-bold text-gray-900 mb-4">练习完成！</h3>

                {step === 'score' ? (
                    <>
                        <p className="text-sm text-gray-600 mb-4">你现在感觉如何？（0=非常糟糕，10=非常棒）</p>
                        <div className="grid grid-cols-6 gap-2 mb-4">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                                <button
                                    key={s}
                                    onClick={() => handleScoreSubmit(s)}
                                    className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg font-medium transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                        <button onClick={onClose} className="w-full text-sm text-gray-400">跳过</button>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-gray-600 mb-2">有什么想记录的吗？（可选）</p>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded mb-4 text-sm"
                            rows={3}
                            placeholder="写下你的感受..."
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">跳过</button>
                            <button onClick={handleFinalSubmit} className="px-4 py-2 bg-green-600 text-white rounded text-sm">
                                提交
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
