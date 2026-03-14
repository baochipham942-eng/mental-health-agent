'use client';

import { Modal, Button } from '@arco-design/web-react';

interface PreExerciseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (score: number) => void;
}

export function PreExerciseModal({ isOpen, onClose, onSubmit }: PreExerciseModalProps) {
    return (
        <Modal
            title="开始前的小调研"
            visible={isOpen}
            onCancel={onClose}
            footer={null}
            maskClosable={false}
            style={{ width: 480, maxWidth: '95vw' }}
        >
            <p className="text-sm text-gray-500 mb-4">你现在感觉如何？请选择心情指数（0=非常糟糕，10=非常棒）</p>
            <div className="grid grid-cols-6 gap-2 mb-4">
                {Array.from({ length: 11 }, (_, i) => i).map(score => (
                    <Button
                        key={score}
                        type="secondary"
                        size="small"
                        onClick={() => onSubmit(score)}
                    >
                        {score}
                    </Button>
                ))}
            </div>
            <Button type="text" long onClick={onClose} className="text-gray-400">
                跳过
            </Button>
        </Modal>
    );
}
