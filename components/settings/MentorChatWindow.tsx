'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button, Input, Avatar, Spin, Message } from '@arco-design/web-react';
import { IconSend, IconClose, IconRobot, IconUser } from '@arco-design/web-react/icon';
import { MentorPersona } from '@/lib/ai/mentors/personas';
import { cn } from '@/lib/utils/cn';
import ReactMarkdown from 'react-markdown';
import type { ChatUIMessage } from '@/types/chat-ui-message';

interface MentorChatWindowProps {
    mentor: MentorPersona;
    onClose: () => void;
}

/** v6: 从 message.parts 提取文本内容 */
function getMessageText(m: ChatUIMessage): string {
    return m.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
}

export function MentorChatWindow({ mentor, onClose }: MentorChatWindowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const [input, setInput] = useState('');
    const labSessionIdRef = useRef<string | null>(null);

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // v6: 自定义 transport — body 是函数（每次发送时读最新 ref 值），
    // fetch 是中间件（拦截 response 头里的 X-Lab-Session-Id）
    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: '/api/chat/mentor',
                body: () => ({
                    mentorId: mentor.id,
                    customMentor: mentor,
                    sessionId: labSessionIdRef.current,
                }),
                fetch: async (input, init) => {
                    const response = await fetch(input, init);
                    const sid = response.headers.get('X-Lab-Session-Id');
                    if (sid) labSessionIdRef.current = sid;
                    return response;
                },
            }),
        [mentor],
    );

    const { messages, sendMessage, status, stop } = useChat<ChatUIMessage>({
        transport,
        messages: [
            {
                id: 'intro',
                role: 'assistant',
                parts: [{ type: 'text', text: mentor.openingMessage }],
            } as ChatUIMessage,
        ],
        onError: (error) => {
            Message.error(`连接中断: ${error.message}`);
        },
        onFinish: () => {
            console.log('[MentorChat] Stream finished');
        },
    });

    const isLoading = status === 'submitted' || status === 'streaming';

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        const text = input;
        setInput('');
        await sendMessage({ text });
    };

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
        yellow: 'bg-yellow-50 text-yellow-900 border-yellow-100',
        rose: 'bg-rose-50 text-rose-900 border-rose-100',
        cyan: 'bg-cyan-50 text-cyan-900 border-cyan-100',
        emerald: 'bg-emerald-50 text-emerald-900 border-emerald-100',
        zinc: 'bg-zinc-100 text-zinc-900 border-zinc-200',
        sky: 'bg-sky-50 text-sky-900 border-sky-100',
        amber: 'bg-amber-50 text-amber-900 border-amber-100',
    };
    const themeClass = colorMap[mentor.themeColor] || 'bg-gray-50';

    const handleClose = () => {
        // Trigger background extraction and session recording
        if (messages.length >= 2) {
            const builtinMentorIds = ['socrates', 'jung', 'adler', 'seligman', 'satir', 'kahneman', 'wittgenstein', 'sartre', 'naval', 'hayek'];
            const isCustom = !builtinMentorIds.includes(mentor.id);
            // 把 v6 parts 结构展平为 {role, content} 给后端 lab-extract 用
            const flatMessages = messages.map((m) => ({
                role: m.role,
                content: getMessageText(m),
            }));
            fetch('/api/memory/lab-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: flatMessages,
                    contextType: 'mentor',
                    contextId: mentor.id,
                    customName: isCustom ? mentor.name : undefined,
                }),
            }).catch(e => console.error('Background extraction failed:', e));
        }
        onClose();
    };

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-white animate-fade-in"
        >
            <div className="w-full bg-white overflow-hidden flex flex-col h-[100dvh]">

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

                {/* Chat Area - min-h-0 is critical for flex child scrolling */}
                <div
                    ref={scrollRef}
                    className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 bg-white scroll-smooth"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    <div className="text-center pb-4">
                        <span className="inline-block px-3 py-1 bg-gray-100 rounded-full text-[10px] text-gray-400">
                            实验功能 · 对话不保存
                        </span>
                    </div>

                    {messages.map((m) => {
                        const text = getMessageText(m);
                        return (
                        <div
                            key={m.id}
                            className={cn(
                                "flex gap-3 mb-4",
                                m.role === 'user' ? "max-w-[80%] ml-auto flex-row-reverse" : "max-w-[85%]"
                            )}
                        >
                            {/* Avatar */}
                            <div className={cn(
                                "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border shadow-sm",
                                m.role === 'user' ? "bg-blue-600 border-blue-600" : "bg-white border-gray-200"
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
                                    "px-4 py-3 rounded-xl text-[15px] leading-relaxed shadow-sm",
                                    m.role === 'user'
                                        ? "bg-blue-600 text-white"
                                        : "bg-white text-gray-900 shadow-glow border border-indigo-50/50 msg-bubble-ai"
                                )}
                            >
                                {m.role === 'user' ? (
                                    text
                                ) : (
                                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 text-gray-800">
                                        <ReactMarkdown>{text}</ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                        );
                    })}

                    {/* Removed redundant loading bubble - content streams in real-time */}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSend();
                        }}
                        className="flex items-center gap-2"
                    >
                        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-glow-card p-1.5">
                            <Input
                                value={input}
                                onChange={(value) => setInput(value)}
                                placeholder={`向${mentor.name}提问...`}
                                className="!bg-transparent !border-none !shadow-none text-[15px] text-gray-900 placeholder:text-gray-400"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                autoFocus
                            />
                        </div>
                        <Button
                            type="primary"
                            htmlType="submit"
                            shape="circle"
                            className="w-11 h-11 flex-shrink-0"
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
        </div>,
        document.getElementById('modal-root') || document.body
    );
}
