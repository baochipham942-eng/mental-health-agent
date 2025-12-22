'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useChat } from 'ai/react';
import { Button, Input, Avatar, Spin, Message } from '@arco-design/web-react';
import { IconSend, IconClose, IconRobot, IconUser } from '@arco-design/web-react/icon';
import { MentorPersona } from '@/lib/ai/mentors/personas';
import { cn } from '@/lib/utils/cn';
import ReactMarkdown from 'react-markdown';

interface MentorChatWindowProps {
    mentor: MentorPersona;
    onClose: () => void;
}

export function MentorChatWindow({ mentor, onClose }: MentorChatWindowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Use Vercel AI SDK hook for ephemeral chat
    const { messages, input, handleInputChange, handleSubmit, isLoading, stop, setInput } = useChat({
        api: '/api/chat/mentor',
        body: {
            mentorId: mentor.id,
        },
        initialMessages: [
            {
                id: 'intro',
                role: 'assistant',
                content: mentor.openingMessage,
            }
        ],
        onError: (error) => {
            Message.error(`连接中断: ${error.message}`);
        },
        onFinish: () => {
            // Ensure UI updates when streaming completes
            console.log('[MentorChat] Stream finished');
        },
    });

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Safety: if isLoading is true for more than 15s, force stop
    // This prevents UI from getting stuck in loading state
    useEffect(() => {
        if (isLoading) {
            const timeout = setTimeout(() => {
                console.warn('[MentorChat] Loading timeout, forcing stop');
                stop();
            }, 15000);
            return () => clearTimeout(timeout);
        }
    }, [isLoading, stop]);

    // Color mapping
    const colorMap: Record<string, string> = {
        slate: 'bg-slate-100 text-slate-900 border-slate-200',
        indigo: 'bg-indigo-50 text-indigo-900 border-indigo-100',
        orange: 'bg-orange-50 text-orange-900 border-orange-100',
    };
    const themeClass = colorMap[mentor.themeColor] || 'bg-gray-50';

    const handleClose = () => {
        // Trigger background extraction
        if (messages.length >= 2) {
            fetch('/api/memory/lab-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages,
                    contextType: 'mentor',
                    contextId: mentor.id
                }),
                // keepalive: true // Optional for component unmount, critical for page unload
            }).catch(e => console.error('Background extraction failed:', e));
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 animate-fade-in">
            <div className="w-full md:max-w-2xl bg-white rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[100dvh] md:h-[85vh] max-h-none md:max-h-[800px] border border-gray-200">

                {/* Header */}
                <div className={`px-6 py-4 border-b flex items-center justify-between ${themeClass} sticky top-0 z-10`}>
                    <div className="flex items-center gap-3">
                        <div className="text-3xl filter drop-shadow-sm">{mentor.avatar}</div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 leading-tight">{mentor.name}</h3>
                            <p className="text-xs text-gray-600 opacity-80 font-medium">{mentor.title}</p>
                        </div>
                    </div>
                    <Button
                        onClick={handleClose}
                        type="text"
                        icon={<IconClose />}
                        className="text-gray-500 hover:bg-black/5 hover:text-gray-900"
                    />
                </div>

                {/* Chat Area */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 bg-white scroll-smooth"
                >
                    <div className="text-center pb-4">
                        <span className="inline-block px-3 py-1 bg-gray-100 rounded-full text-[10px] text-gray-400">
                            实验功能 · 对话不保存
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
                                    <span className="text-lg">{mentor.avatar}</span>
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
                            // Prevent empty submission
                            if (!input.trim()) { e.preventDefault(); return; }
                            handleSubmit(e);
                        }}
                        className="flex gap-3 relative"
                    >
                        <Input
                            value={input}
                            onChange={(e) => handleInputChange({ target: { value: e } } as any)}
                            placeholder={`向${mentor.name}提问...`}
                            className="px-4 py-3 h-12 rounded-xl bg-gray-50 border-transparent hover:bg-white hover:border-indigo-300 focus:bg-white focus:border-indigo-500 transition-all text-base"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (input.trim()) {
                                        const fakeEvent = { preventDefault: () => { } } as React.FormEvent;
                                        handleSubmit(fakeEvent);
                                    }
                                }
                            }}
                            autoFocus
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
                    <div className="text-center mt-2">
                        <p className="text-[10px] text-gray-400">
                            AI 生成内容仅供参考，不构成专业医疗建议
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
