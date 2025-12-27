'use client';

import { useEffect, useState, useMemo } from 'react';
import { Tooltip } from '@arco-design/web-react';
import { cn } from '@/lib/utils/cn';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useCloudVoiceRecognition, CloudVoiceStatus } from '@/hooks/useCloudVoiceRecognition';

interface VoiceInputButtonProps {
    onTranscript: (text: string) => void;
    disabled?: boolean;
    size?: number;
}

/**
 * 检测是否在微信浏览器中
 */
function isWeChatBrowser(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('micromessenger');
}

/**
 * 检测 Web Speech API 是否真正可用
 * 微信浏览器虽然报告支持，但实际不工作
 */
function isWebSpeechSupported(): boolean {
    if (typeof window === 'undefined') return false;
    // 微信浏览器报告支持但实际不工作
    if (isWeChatBrowser()) return false;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    return !!SpeechRecognition;
}

/**
 * 语音输入按钮组件
 * 
 * 优先使用 Web Speech API（低延迟），不支持时自动降级到云端 Groq Whisper
 */
export function VoiceInputButton({
    onTranscript,
    disabled = false,
    size = 44,
}: VoiceInputButtonProps) {
    const [localTranscript, setLocalTranscript] = useState('');

    // 判断使用哪种识别方式
    const useWebSpeech = useMemo(() => isWebSpeechSupported(), []);

    // Web Speech API hook
    const webSpeech = useVoiceRecognition({
        onTranscript: (text, isFinal) => {
            setLocalTranscript(text);
            if (isFinal) {
                onTranscript(text);
            }
        },
        maxDuration: 60,
    });

    // Cloud (Groq Whisper) hook
    const cloudSpeech = useCloudVoiceRecognition({
        onTranscript: (text) => {
            onTranscript(text);
        },
        maxDuration: 60,
    });

    // 选择当前使用的 hook
    const currentHook = useWebSpeech ? webSpeech : cloudSpeech;

    // 统一状态
    const isRecording = useWebSpeech
        ? webSpeech.status === 'listening'
        : cloudSpeech.status === 'recording';
    const isTranscribing = !useWebSpeech && cloudSpeech.status === 'transcribing';
    const duration = useWebSpeech ? webSpeech.duration : cloudSpeech.duration;
    const error = useWebSpeech ? webSpeech.error : cloudSpeech.error;
    const isSupported = useWebSpeech ? webSpeech.isSupported : cloudSpeech.isSupported;

    // Web Speech: 识别结束时发送
    useEffect(() => {
        if (useWebSpeech && webSpeech.status === 'idle' && localTranscript) {
            onTranscript(localTranscript);
            setLocalTranscript('');
        }
    }, [webSpeech.status, localTranscript, onTranscript, useWebSpeech]);

    // 微信浏览器暂时不支持语音（Groq 代理方案有问题）
    // TODO: 找到可用的 STT 服务后移除此限制
    const isWeChat = useMemo(() => isWeChatBrowser(), []);
    if (isWeChat) {
        return null;
    }

    // 不支持任何语音识别时不渲染
    if (!isSupported) {
        return null;
    }

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };

    const getTooltipContent = () => {
        if (error) return `错误: ${error}`;
        if (isTranscribing) return '正在识别...';
        if (isRecording) return `录音中 ${formatDuration(duration)}，点击停止`;
        return useWebSpeech ? '语音输入(浏览器)' : '语音输入(云端)';
    };

    const isActive = isRecording || isTranscribing;

    return (
        <Tooltip content={getTooltipContent()} position="top">
            <button
                type="button"
                onClick={currentHook.toggle}
                disabled={disabled || isTranscribing}
                className={cn(
                    'relative flex items-center justify-center rounded-full transition-all duration-200',
                    'focus:outline-none',
                    isRecording && 'bg-red-500 text-white shadow-md',
                    isTranscribing && 'bg-blue-500 text-white shadow-md',
                    !isActive && 'text-gray-400 hover:text-gray-600',
                    (disabled || isTranscribing) && 'opacity-50 cursor-not-allowed'
                )}
                style={{ width: size, height: size, flexShrink: 0, alignSelf: 'center' }}
                aria-label={isRecording ? '停止录音' : '开始语音输入'}
            >
                {/* 转写中显示加载动画 */}
                {isTranscribing ? (
                    <svg
                        className="animate-spin mx-auto"
                        width={size * 0.45}
                        height={size * 0.45}
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ display: 'block', margin: '0 auto' }}
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                ) : (
                    /* 麦克风图标 */
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
                        className={cn(isRecording && 'animate-pulse')}
                    >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                )}

                {/* 录音脉动动画 */}
                {isRecording && (
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
