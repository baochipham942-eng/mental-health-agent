'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type VoiceRecognitionStatus = 'idle' | 'listening' | 'processing' | 'unsupported' | 'error';

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
    error: string;
    message?: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface UseVoiceRecognitionOptions {
    onTranscript?: (text: string, isFinal: boolean) => void;
    language?: string;
    continuous?: boolean;
    maxDuration?: number; // 最大录音时长（秒）
}

interface UseVoiceRecognitionReturn {
    status: VoiceRecognitionStatus;
    duration: number; // 当前录音时长（秒）
    transcript: string; // 当前识别文本
    isSupported: boolean;
    start: () => void;
    stop: () => void;
    toggle: () => void;
    error: string | null;
}

/**
 * 语音识别 Hook
 * 使用浏览器原生 Web Speech API
 */
export function useVoiceRecognition(options: UseVoiceRecognitionOptions = {}): UseVoiceRecognitionReturn {
    const {
        onTranscript,
        language = 'zh-CN',
        continuous = true,
        maxDuration = 60,
    } = options;

    const [status, setStatus] = useState<VoiceRecognitionStatus>('idle');
    const [duration, setDuration] = useState(0);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSupported, setIsSupported] = useState(true);

    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number>(0);

    // 检测浏览器支持
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setIsSupported(false);
            setStatus('unsupported');
        }
    }, []);

    // 初始化语音识别
    const initRecognition = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const recognition = new SpeechRecognition() as SpeechRecognition;
        recognition.lang = language;
        recognition.continuous = continuous;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setStatus('listening');
            setError(null);
            startTimeRef.current = Date.now();

            // 开始计时
            durationTimerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                setDuration(elapsed);

                // 超时自动停止
                if (elapsed >= maxDuration) {
                    recognition.stop();
                }
            }, 1000);

            // 移动端振动反馈
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        };

        recognition.onend = () => {
            setStatus('idle');
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current);
                durationTimerRef.current = null;
            }
            setDuration(0);

            // 移动端振动反馈
            if (navigator.vibrate) {
                navigator.vibrate([30, 30, 30]);
            }
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            const currentText = finalTranscript || interimTranscript;
            setTranscript(currentText);

            if (onTranscript) {
                onTranscript(currentText, !!finalTranscript);
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('[VoiceRecognition] Error:', event.error);

            let errorMessage = '语音识别出错';
            switch (event.error) {
                case 'not-allowed':
                    errorMessage = '请允许麦克风权限';
                    break;
                case 'no-speech':
                    errorMessage = '未检测到语音';
                    break;
                case 'network':
                    errorMessage = '网络连接错误';
                    break;
                case 'audio-capture':
                    errorMessage = '无法访问麦克风';
                    break;
                case 'aborted':
                    // 用户主动停止，不显示错误
                    return;
            }

            setError(errorMessage);
            setStatus('error');
        };

        return recognition;
    }, [language, continuous, maxDuration, onTranscript]);

    // 开始录音
    const start = useCallback(() => {
        if (!isSupported) return;

        setTranscript('');
        setError(null);

        try {
            recognitionRef.current = initRecognition();
            recognitionRef.current?.start();
        } catch (e) {
            console.error('[VoiceRecognition] Start failed:', e);
            setError('启动语音识别失败');
            setStatus('error');
        }
    }, [isSupported, initRecognition]);

    // 停止录音
    const stop = useCallback(() => {
        try {
            recognitionRef.current?.stop();
        } catch (e) {
            console.error('[VoiceRecognition] Stop failed:', e);
        }
    }, []);

    // 切换录音状态
    const toggle = useCallback(() => {
        if (status === 'listening') {
            stop();
        } else {
            start();
        }
    }, [status, start, stop]);

    // 清理
    useEffect(() => {
        return () => {
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current);
            }
            recognitionRef.current?.abort();
        };
    }, []);

    return {
        status,
        duration,
        transcript,
        isSupported,
        start,
        stop,
        toggle,
        error,
    };
}
