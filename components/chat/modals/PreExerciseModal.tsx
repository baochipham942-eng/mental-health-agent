'use client';

import { useState } from 'react';

interface PreExerciseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (score: number) => void;
}

export function PreExerciseModal({ isOpen, onClose, onSubmit }: PreExerciseModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
                <h3 className="text-lg font-bold text-gray-900 mb-4">开始前的小调研</h3>
                <p className="text-sm text-gray-600 mb-4">你现在感觉如何？请选择心情指数（0=非常糟糕，10=非常棒）</p>
                <div className="grid grid-cols-6 gap-2 mb-4">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                        <button
                            key={score}
                            onClick={() => onSubmit(score)}
                            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors"
                        >
                            {score}
                        </button>
                    ))}
                </div>
                <button
                    onClick={onClose}
                    className="w-full px-4 py-2 text-sm text-gray-400 hover:text-gray-600"
                >
                    跳过
                </button>
            </div>
        </div>
    );
}
