'use client';

import { useState, useRef, useCallback } from 'react';
import { bufferToWav, bufferToPCM } from '@/lib/utils/audio';

export type CloudVoiceStatus = 'idle' | 'recording' | 'transcribing' | 'error';

interface UseCloudVoiceRecognitionOptions {
    onTranscript?: (text: string) => void;
    maxDuration?: number; // 最大录音时长（秒）
}

interface UseCloudVoiceRecognitionReturn {
    status: CloudVoiceStatus;
    duration: number;
    isSupported: boolean;
    start: () => void;
    stop: () => void;
    toggle: () => void;
    error: string | null;
}

/**
 * 云端语音识别 Hook (使用 Groq Whisper API)
 * 使用 MediaRecorder 录音，上传到服务端转写
 * 兼容性更好，支持微信浏览器
 */
export function useCloudVoiceRecognition(
    options: UseCloudVoiceRecognitionOptions = {}
): UseCloudVoiceRecognitionReturn {
    const { onTranscript, maxDuration = 60 } = options;

    const [status, setStatus] = useState<CloudVoiceStatus>('idle');
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSupported, setIsSupported] = useState(true);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number>(0);

    // 检测 MediaRecorder 支持
    const checkSupport = useCallback(() => {
        if (typeof window === 'undefined') return false;
        if (!navigator.mediaDevices?.getUserMedia) return false;
        if (!window.MediaRecorder) return false;
        return true;
    }, []);

    // 开始录音
    const start = useCallback(async () => {
        if (!checkSupport()) {
            setIsSupported(false);
            setError('您的浏览器不支持录音功能');
            return;
        }

        try {
            setError(null);
            setStatus('recording');
            chunksRef.current = [];

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // 选择最佳格式
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // 停止所有音轨
                stream.getTracks().forEach(track => track.stop());

                // 清除计时器
                if (durationIntervalRef.current) {
                    clearInterval(durationIntervalRef.current);
                    durationIntervalRef.current = null;
                }

                // 如果有录音数据，上传转写
                if (chunksRef.current.length > 0) {
                    setStatus('transcribing');
                    try {
                        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
                        console.log('[CloudVoice] Audio blob:', {
                            chunks: chunksRef.current.length,
                            size: audioBlob.size,
                            type: audioBlob.type,
                        });

                        // 重采样到 16000Hz (百度语音要求)
                        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                        const arrayBuffer = await audioBlob.arrayBuffer();
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                        const offlineContext = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
                        const source = offlineContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(offlineContext.destination);
                        source.start();


                        const renderedBuffer = await offlineContext.startRendering();

                        // 转换为 PCM 格式 (无头) - 避免百度报错 3311 (WAV头采样率问题)
                        const pcmBlob = bufferToPCM(renderedBuffer);

                        const formData = new FormData();
                        formData.append('audio', pcmBlob, 'recording.pcm');

                        console.log('[CloudVoice] Sending 16kHz PCM to API...', pcmBlob.size);
                        const response = await fetch('/api/speech/transcribe', {
                            method: 'POST',
                            body: formData,
                        });

                        console.log('[CloudVoice] Response status:', response.status);

                        const responseData = await response.json();
                        console.log('[CloudVoice] Response data:', responseData);

                        if (!response.ok) {
                            throw new Error(responseData.error || '转写失败');
                        }

                        const { text } = responseData;
                        if (text && onTranscript) {
                            onTranscript(text);
                        }
                        setStatus('idle');
                    } catch (err) {
                        console.error('[CloudVoice] Transcription or audio processing error:', err);
                        setError(err instanceof Error ? err.message : '转写失败');
                        setStatus('error');
                    }
                } else {
                    console.warn('[CloudVoice] No audio chunks recorded');
                    setStatus('idle');
                }

                setDuration(0);
            };

            mediaRecorder.onerror = (event) => {
                console.error('[CloudVoice] MediaRecorder error:', event);
                setError('录音出错');
                setStatus('error');
            };

            // 开始录音
            mediaRecorder.start(1000); // 每秒收集一次数据
            startTimeRef.current = Date.now();

            // 振动反馈
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }

            // 开始计时
            durationIntervalRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
                setDuration(elapsed);

                // 超时自动停止
                if (elapsed >= maxDuration) {
                    mediaRecorder.stop();
                }
            }, 1000);

        } catch (err) {
            console.error('[CloudVoice] Start error:', err);
            if (err instanceof Error && err.name === 'NotAllowedError') {
                setError('请允许麦克风权限');
            } else {
                setError('无法访问麦克风');
            }
            setStatus('error');
        }
    }, [checkSupport, maxDuration, onTranscript]);

    // 停止录音
    const stop = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            // 振动反馈
            if (navigator.vibrate) {
                navigator.vibrate([30, 30, 30]);
            }
        }
    }, []);

    // 切换状态
    const toggle = useCallback(() => {
        if (status === 'recording') {
            stop();
        } else if (status === 'idle' || status === 'error') {
            start();
        }
        // transcribing 状态下不允许操作
    }, [status, start, stop]);

    return {
        status,
        duration,
        isSupported,
        start,
        stop,
        toggle,
        error,
    };
}
