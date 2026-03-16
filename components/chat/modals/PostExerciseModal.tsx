'use client';

import { useState } from 'react';
import { Modal, Button, Input } from '@arco-design/web-react';

interface PostExerciseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (score: number, feedback: string) => void;
}

export function PostExerciseModal({ isOpen, onClose, onSubmit }: PostExerciseModalProps) {
    const [step, setStep] = useState<'score' | 'feedback'>('score');
    const [score, setScore] = useState<number | null>(null);
    const [feedback, setFeedback] = useState('');

    function handleScoreSubmit(s: number) {
        setScore(s);
        setStep('feedback');
    }

    function handleFinalSubmit() {
        if (score !== null) {
            onSubmit(score, feedback);
            // 漏斗埋点：技能练习完成
            fetch('/api/progress/funnel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'l1_skill_completed', score }),
            }).catch(() => {});
        }
    }

    function handleClose() {
        setStep('score');
        setScore(null);
        setFeedback('');
        onClose();
    }

    return (
        <Modal
            title="练习完成！"
            visible={isOpen}
            onCancel={handleClose}
            footer={null}
            maskClosable={false}
            style={{ width: 480, maxWidth: '95vw' }}
        >
            {step === 'score' ? (
                <>
                    <p className="text-sm text-gray-500 mb-4">你现在感觉如何？（0=非常糟糕，10=非常棒）</p>
                    <div className="grid grid-cols-6 gap-2 mb-4">
                        {Array.from({ length: 11 }, (_, i) => i).map(s => (
                            <Button
                                key={s}
                                type="secondary"
                                size="small"
                                onClick={() => handleScoreSubmit(s)}
                            >
                                {s}
                            </Button>
                        ))}
                    </div>
                    <Button type="text" long onClick={handleClose} className="text-gray-400">跳过</Button>
                </>
            ) : (
                <>
                    <p className="text-sm text-gray-500 mb-2">有什么想记录的吗？（可选）</p>
                    <Input.TextArea
                        placeholder="写下你的感受..."
                        rows={3}
                        value={feedback}
                        onChange={setFeedback}
                        className="mb-4"
                        aria-label="练习感受反馈"
                    />
                    <div className="flex justify-end gap-2">
                        <Button onClick={handleClose}>跳过</Button>
                        <Button type="primary" onClick={handleFinalSubmit}>提交</Button>
                    </div>
                </>
            )}
        </Modal>
    );
}
