'use client';

import { useEffect, useState } from 'react';
import { Tooltip } from '@arco-design/web-react';
import { cn } from '@/lib/utils/cn';
import { useVoiceRecognition, VoiceRecognitionStatus } from '@/hooks/useVoiceRecognition';

interface VoiceInputButtonProps {
    onTranscript: (text: string) => void;
    disabled?: boolean;
    size?: number;
}

/**
 * 语音输入按钮组件
 * 
 * 状态：
 * - idle: 灰色麦克风图标
 * - listening: 红色脉动动画
 * - processing: 蓝色加载
 * - unsupported: 禁用状态
 */
export function VoiceInputButton({
    onTranscript,
    disabled = false,
    size = 44,
}: VoiceInputButtonProps) {
    const [localTranscript, setLocalTranscript] = useState('');

    const {
        status,
        duration,
        isSupported,
        toggle,
        stop,
        error,
    } = useVoiceRecognition({
        onTranscript: (text, isFinal) => {
            setLocalTranscript(text);
            if (isFinal) {
                onTranscript(text);
            }
        },
        maxDuration: 60,
    });

    // 识别结束时，如果有文本就发送（处理非 final 情况）
    useEffect(() => {
        if (status === 'idle' && localTranscript) {
            onTranscript(localTranscript);
            setLocalTranscript('');
        }
    }, [status, localTranscript, onTranscript]);

    // 不支持语音识别时不渲染
    if (!isSupported) {
        return null;
    }

    const isListening = status === 'listening';
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };

    const getTooltipContent = () => {
        if (error) return error;
        if (isListening) return `录音中 ${formatDuration(duration)}，点击停止`;
        return '点击开始语音输入';
    };

    return (
        <Tooltip content={getTooltipContent()} position="top">
            <button
                type="button"
                onClick={toggle}
                disabled={disabled}
                className={cn(
                    'relative flex items-center justify-center rounded-full transition-all duration-200',
                    'focus:outline-none',
                    isListening
                        ? 'bg-red-500 text-white shadow-md'
                        : 'text-gray-400 hover:text-gray-600',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
                style={{ width: size, height: size }}
                aria-label={isListening ? '停止录音' : '开始语音输入'}
            >
                {/* 麦克风图标 */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={size * 0.45}
                    height={size * 0.45}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(isListening && 'animate-pulse')}
                >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                </svg>

                {/* 录音脉动动画 */}
                {isListening && (
                    <>
                        <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                        </span>
                    </>
                )}
            </button>
        </Tooltip>
    );
}
