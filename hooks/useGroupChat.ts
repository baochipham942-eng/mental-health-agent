'use client';

import { useState, useCallback, useRef } from 'react';
import type { GroupChatIntent, GroupMessage, GroupSSEEvent } from '@/types/chat';

interface UseGroupChatOptions {
    mentorIds: string[];
    mode: 'discuss' | 'debate';
    topic?: string;
}

export interface UseGroupChatReturn {
    messages: GroupMessage[];
    sendMessage: (content: string, intent?: GroupChatIntent) => void;
    isLoading: boolean;
    activeMentorId: string | null;
    currentRound: number;
    stop: () => void;
    reset: () => void;
}

let messageIdCounter = 0;
function generateId() {
    return `gm-${Date.now()}-${++messageIdCounter}`;
}

export function useGroupChat(options: UseGroupChatOptions): UseGroupChatReturn {
    const { mentorIds, mode, topic } = options;
    const [messages, setMessages] = useState<GroupMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeMentorId, setActiveMentorId] = useState<string | null>(null);
    const [currentRound, setCurrentRound] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    const currentMentorMsgRef = useRef<{
        id: string;
        mentorId: string;
        mentorName: string;
        mentorAvatar: string;
        mentorColor: string;
        round: number;
        content: string;
    } | null>(null);

    const sendMessage = useCallback(async (content: string, intent: GroupChatIntent = 'discuss') => {
        if (isLoading || !content.trim()) return;

        const userMsg: GroupMessage = {
            id: generateId(),
            role: 'user',
            content: content.trim(),
            timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        const allMessages = [...messages, userMsg].map(m => {
            const role: 'user' | 'assistant' = m.role === 'user' ? 'user' : 'assistant';
            return {
                role,
                content: m.content,
                mentorId: m.mentorId,
                round: m.round,
            };
        });

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetch('/api/chat/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: allMessages,
                    mentorIds,
                    mode,
                    topic,
                    intent,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr) continue;

                    try {
                        const event: GroupSSEEvent = JSON.parse(jsonStr);
                        handleSSEEvent(event);
                    } catch (e) {
                        console.warn('[useGroupChat] Failed to parse SSE event:', jsonStr);
                    }
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error('[useGroupChat] Error:', error);
            }
        } finally {
            if (currentMentorMsgRef.current) {
                flushCurrentMentorMessage();
            }
            setIsLoading(false);
            setActiveMentorId(null);
            abortRef.current = null;
        }
    }, [isLoading, messages, mentorIds, mode, topic]);

    function handleSSEEvent(event: GroupSSEEvent) {
        switch (event.type) {
            case 'mentor_start': {
                currentMentorMsgRef.current = {
                    id: generateId(),
                    mentorId: event.mentorId,
                    mentorName: event.mentorName,
                    mentorAvatar: event.mentorAvatar,
                    mentorColor: event.mentorColor,
                    round: event.round,
                    content: '',
                };
                setActiveMentorId(event.mentorId);
                setCurrentRound(event.round);

                const newMsg: GroupMessage = {
                    id: currentMentorMsgRef.current.id,
                    role: 'assistant',
                    content: '',
                    mentorId: event.mentorId,
                    mentorName: event.mentorName,
                    mentorAvatar: event.mentorAvatar,
                    mentorColor: event.mentorColor,
                    round: event.round,
                    timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, newMsg]);
                break;
            }

            case 'mentor_chunk': {
                if (!currentMentorMsgRef.current) break;
                currentMentorMsgRef.current.content += event.content;
                const msgId = currentMentorMsgRef.current.id;
                const updatedContent = currentMentorMsgRef.current.content;
                setMessages(prev =>
                    prev.map(m =>
                        m.id === msgId ? { ...m, content: updatedContent } : m
                    )
                );
                break;
            }

            case 'mentor_end': {
                flushCurrentMentorMessage();
                setActiveMentorId(null);
                break;
            }

            case 'moderator': {
                const modMsg: GroupMessage = {
                    id: generateId(),
                    role: 'moderator',
                    content: event.content,
                    moderatorAction: event.action,
                    targetMentorId: event.targetMentorId,
                    timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, modMsg]);
                break;
            }

            case 'synthesis': {
                const synMsg: GroupMessage = {
                    id: generateId(),
                    role: 'synthesis',
                    content: event.content,
                    timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, synMsg]);
                break;
            }

            case 'round_end': {
                setCurrentRound(event.round);
                break;
            }

            case 'done': {
                setIsLoading(false);
                break;
            }

            case 'error': {
                console.error('[useGroupChat] Server error:', event.message);
                setIsLoading(false);
                break;
            }
        }
    }

    function flushCurrentMentorMessage() {
        currentMentorMsgRef.current = null;
    }

    const stop = useCallback(() => {
        abortRef.current?.abort();
        setIsLoading(false);
        setActiveMentorId(null);
    }, []);

    const reset = useCallback(() => {
        stop();
        setMessages([]);
        setCurrentRound(0);
    }, [stop]);

    return {
        messages,
        sendMessage,
        isLoading,
        activeMentorId,
        currentRound,
        stop,
        reset,
    };
}
