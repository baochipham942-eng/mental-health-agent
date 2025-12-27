'use client';

import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from 'ai/react';
import { Button, Input, Message } from '@arco-design/web-react';
import { IconSend, IconClose, IconUser } from '@arco-design/web-react/icon';
import { MBTIPersona } from '@/lib/ai/mbti/personas';
import { cn } from '@/lib/utils/cn';
import ReactMarkdown from 'react-markdown';
import { VoiceInputButton } from '@/components/chat/VoiceInputButton';

interface MBTIChatWindowProps {
    userMbti: string; // The user's own type
    targetPersona: MBTIPersona; // The AI's type
    onClose: () => void;
}

export function MBTIChatWindow({ userMbti, targetPersona, onClose }: MBTIChatWindowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // Use Vercel AI SDK hook for ephemeral chat
    const { messages, input, handleInputChange, handleSubmit, isLoading, stop, setInput } = useChat({
        api: '/api/chat/mbti',
        body: {
            mbtiType: targetPersona.type,
            userMbti: userMbti, // Optional context
        },
        initialMessages: [
            {
                id: 'intro',
                role: 'assistant',
                content: targetPersona.probing_question,
            }
        ],
        onError: (error) => {
            Message.error(`连接中断: ${error.message}`);
        },
        onFinish: () => {
            console.log('[MBTIChat] Stream finished');
        },
    });

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Safety: if isLoading is true for more than 15s, force stop
    useEffect(() => {
        if (isLoading) {
            const timeout = setTimeout(() => {
                console.warn('[MBTIChat] Loading timeout, forcing stop');
                stop();
            }, 15000);
            return () => clearTimeout(timeout);
        }
    }, [isLoading, stop]);

    // Theme color mapping
    const themeColors: Record<string, string> = {
        purple: 'bg-purple-50 text-purple-900 border-purple-100',
        green: 'bg-green-50 text-green-900 border-green-100',
        blue: 'bg-blue-50 text-blue-900 border-blue-100',
        yellow: 'bg-yellow-50 text-yellow-900 border-yellow-100',
    };
    const headerClass = themeColors[targetPersona.color] || 'bg-gray-50';

    const handleClose = () => {
        // Trigger background extraction
        if (messages.length >= 2) {
            fetch('/api/memory/lab-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages,
                    contextType: 'mbti',
                    contextId: targetPersona.id
                }),
            }).catch(e => console.error('Background extraction failed:', e));
        }
        onClose();
    };

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
        >
            <div className="w-full md:max-w-2xl bg-white rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[100dvh] md:h-[85vh] max-h-none md:max-h-[800px] border border-gray-200">

                {/* Header */}
                <div className={`px-6 py-4 border-b flex items-center justify-between ${headerClass} sticky top-0 z-10`}>
                    <div className="flex items-center gap-3">
                        <div className="text-3xl filter drop-shadow-sm">{targetPersona.avatar}</div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 leading-tight">
                                {targetPersona.name} <span className="opacity-60 text-sm font-normal">({targetPersona.type})</span>
                            </h3>
                            <p className="text-xs text-gray-600 opacity-80 font-medium">{targetPersona.alias}</p>
                        </div>
                    </div>
                    <Button
                        onClick={handleClose}
                        type="text"
                        icon={<IconClose />}
                        className="text-gray-500 hover:bg-black/5 hover:text-gray-900"
                    />
                </div>

                {/* Chat Area - min-h-0 is critical for flex child scrolling */}
                <div
                    ref={scrollRef}
                    className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 bg-white scroll-smooth"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    <div className="text-center pb-4">
                        <span className="inline-block px-3 py-1 bg-gray-100 rounded-full text-[10px] text-gray-400">
                            镜像回廊 · {userMbti} 对话 {targetPersona.type}
                        </span>
                    </div>

                    {messages.map((m) => (
                        <div
                            key={m.id}
                            className={cn(
                                "flex gap-4 max-w-[90%]",
                                m.role === 'user' ? "ml-auto flex-row-reverse" : ""
                            )}
                        >
                            {/* Avatar */}
                            <div className={cn(
                                "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border shadow-sm",
                                m.role === 'user' ? "bg-indigo-600 border-indigo-600" : "bg-white border-gray-200"
                            )}>
                                {m.role === 'user' ? (
                                    <IconUser className="text-white text-sm" />
                                ) : (
                                    <span className="text-lg">{targetPersona.avatar}</span>
                                )}
                            </div>

                            {/* Message Bubble */}
                            <div
                                className={cn(
                                    "px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm border",
                                    m.role === 'user'
                                        ? "bg-indigo-600 text-white border-indigo-600 rounded-tr-sm"
                                        : "bg-gray-50 text-gray-800 border-gray-100 rounded-tl-sm"
                                )}
                            >
                                {m.role === 'user' ? (
                                    m.content
                                ) : (
                                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 text-gray-800">
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Removed redundant loading bubble - content streams in real-time */}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <form
                        onSubmit={(e) => {
                            if (!input.trim()) { e.preventDefault(); return; }
                            handleSubmit(e);
                        }}
                        className="flex gap-3 relative"
                    >
                        <Input
                            value={input}
                            onChange={(e) => handleInputChange({ target: { value: e } } as any)}
                            placeholder={`作为 ${userMbti}，你想对 TA 说...`}
                            className="px-4 py-3 h-12 rounded-xl bg-gray-50 border-transparent hover:bg-white hover:border-indigo-300 focus:bg-white focus:border-indigo-500 transition-all text-base"
                            autoFocus
                        />
                        <VoiceInputButton
                            onTranscript={(text) => setInput(prev => prev ? `${prev} ${text}` : text)}
                            disabled={isLoading}
                            size={48}
                        />
                        <Button
                            type="primary"
                            htmlType="submit"
                            className="h-12 w-12 rounded-xl flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-md transition-all"
                            icon={<IconSend />}
                            loading={isLoading}
                            disabled={!input.trim() || isLoading}
                        />
                    </form>
                </div>

            </div>
        </div>,
        document.getElementById('modal-root') || document.body
    );
}
