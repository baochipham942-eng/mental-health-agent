'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input } from '@arco-design/web-react';
import { IconSend, IconClose, IconUser } from '@arco-design/web-react/icon';
import { getMentor } from '@/lib/ai/mentors/personas';
import { useGroupChat } from '@/hooks/useGroupChat';
import { GroupMessage } from '@/types/chat';
import { cn } from '@/lib/utils/cn';
import ReactMarkdown from 'react-markdown';

interface GroupChatWindowProps {
    mentorIds: string[];
    mode: 'discuss' | 'debate';
    topic: string;
    onClose: () => void;
}

// 颜色映射：大师气泡背景色
const bubbleColorMap: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200',
    indigo: 'bg-indigo-50 border-indigo-200',
    orange: 'bg-orange-50 border-orange-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    rose: 'bg-rose-50 border-rose-200',
    cyan: 'bg-cyan-50 border-cyan-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    zinc: 'bg-zinc-50 border-zinc-200',
    sky: 'bg-sky-50 border-sky-200',
    amber: 'bg-amber-50 border-amber-200',
};

const nameColorMap: Record<string, string> = {
    slate: 'text-slate-700',
    indigo: 'text-indigo-700',
    orange: 'text-orange-700',
    yellow: 'text-yellow-700',
    rose: 'text-rose-700',
    cyan: 'text-cyan-700',
    emerald: 'text-emerald-700',
    zinc: 'text-zinc-700',
    sky: 'text-sky-700',
    amber: 'text-amber-700',
};

export function GroupChatWindow({ mentorIds, mode, topic, onClose }: GroupChatWindowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const [input, setInput] = useState('');

    const {
        messages,
        sendMessage,
        isLoading,
        activeMentorId,
        currentRound,
        stop,
    } = useGroupChat({ mentorIds, mode, topic });

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // 自动发送初始话题
    const initialSentRef = useRef(false);
    useEffect(() => {
        if (mounted && !initialSentRef.current && topic) {
            initialSentRef.current = true;
            sendMessage(topic);
        }
    }, [mounted, topic, sendMessage]);

    // 自动滚动到底部
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, activeMentorId]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage(input.trim());
        setInput('');
    };

    const handleClose = () => {
        if (messages.length >= 2) {
            const userMsgs = messages.filter(m => m.role === 'user');
            if (userMsgs.length > 0) {
                fetch('/api/memory/lab-extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: messages.map(m => ({
                            role: m.role === 'moderator' || m.role === 'synthesis' ? 'assistant' : m.role,
                            content: m.mentorName
                                ? `[${m.mentorName}]: ${m.content}`
                                : m.role === 'moderator'
                                    ? `[主持人]: ${m.content}`
                                    : m.content,
                        })),
                        contextType: 'group',
                        contextId: mentorIds.join(','),
                        groupConfig: { mentorIds, mode },
                    }),
                }).catch(e => console.error('Background extraction failed:', e));
            }
        }
        onClose();
    };

    const mentorsInfo = mentorIds
        .map(id => getMentor(id))
        .filter(Boolean);

    // 判断是否需要显示轮次分隔线
    const shouldShowRoundSeparator = (msg: GroupMessage, index: number) => {
        if (msg.role === 'user' || msg.role === 'moderator' || msg.role === 'synthesis' || !msg.round) return false;
        const prevMsg = messages[index - 1];
        if (!prevMsg) return false;
        if (prevMsg.role === 'user') return false;
        if (prevMsg.round && msg.round > prevMsg.round) return true;
        return false;
    };

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-9999 flex items-center justify-center bg-white animate-fade-in"
        >
            <div className="w-full bg-white overflow-hidden flex flex-col h-dvh">

                {/* Header */}
                <div className="px-6 py-4 border-b bg-linear-to-r from-violet-50 to-indigo-50 sticky top-0 z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="text-2xl">🎭</div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 leading-tight">
                                    圆桌论道
                                    <span className="ml-2 text-xs font-normal text-violet-600">
                                        {mode === 'debate' ? '⚔️ 辩论模式' : '💬 讨论模式'}
                                    </span>
                                </h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    {mentorsInfo.map(m => m && (
                                        <span key={m.id} className="text-sm" title={m.name}>
                                            {m.avatar}
                                        </span>
                                    ))}
                                    <span className="text-xs text-gray-500 ml-1">
                                        {currentRound > 0 ? `第 ${currentRound} 轮` : '准备中'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <Button
                            onClick={handleClose}
                            type="text"
                            icon={<IconClose />}
                            className="text-gray-500 hover:bg-black/5 hover:text-gray-900"
                        />
                    </div>
                </div>

                {/* Chat Area */}
                <div
                    ref={scrollRef}
                    className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 bg-white scroll-smooth"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    {/* 话题提示 */}
                    <div className="text-center pb-2">
                        <span className="inline-block px-4 py-1.5 bg-violet-50 rounded-full text-xs text-violet-600 font-medium border border-violet-100">
                            话题：{topic}
                        </span>
                    </div>

                    {messages.map((msg, index) => (
                        <React.Fragment key={msg.id}>
                            {/* 轮次分隔线 */}
                            {shouldShowRoundSeparator(msg, index) && (
                                <div className="flex items-center gap-3 py-2">
                                    <div className="flex-1 h-px bg-gray-200" />
                                    <span className="text-xs text-gray-400 font-medium">
                                        第 {msg.round} 轮
                                    </span>
                                    <div className="flex-1 h-px bg-gray-200" />
                                </div>
                            )}

                            {/* 消息渲染 */}
                            {msg.role === 'user' ? (
                                <div className="flex gap-3 max-w-[80%] ml-auto flex-row-reverse">
                                    <div className="shrink-0 w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center border border-blue-600 shadow-xs">
                                        <IconUser className="text-white text-sm" />
                                    </div>
                                    <div className="px-4 py-3 rounded-xl bg-blue-600 text-white text-[15px] leading-relaxed shadow-xs">
                                        {msg.content}
                                    </div>
                                </div>
                            ) : msg.role === 'moderator' ? (
                                <ModeratorBubble msg={msg} />
                            ) : msg.role === 'synthesis' ? (
                                <SynthesisBubble msg={msg} />
                            ) : (
                                <MentorMessageBubble
                                    msg={msg}
                                    isStreaming={activeMentorId === msg.mentorId && isLoading}
                                />
                            )}
                        </React.Fragment>
                    ))}

                    {/* 活跃发言指示器 */}
                    {isLoading && activeMentorId && (
                        <ActiveSpeakerIndicator mentorId={activeMentorId} />
                    )}

                    {/* 加载中但没有活跃大师（可能是 Moderator 在思考）*/}
                    {isLoading && !activeMentorId && messages.length > 0 && (
                        <div className="flex items-center gap-2 justify-center text-xs text-gray-400 py-2">
                            <span>🎭</span>
                            <span>主持人正在组织讨论</span>
                            <span className="flex gap-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                        </div>
                    )}
                </div>

                {/* Input + Quick Actions */}
                <div className="p-4 bg-white border-t border-gray-100">
                    {!isLoading && messages.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                            <button
                                onClick={() => sendMessage('请各位继续讨论，进一步深入这个话题。')}
                                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                                继续讨论
                            </button>
                            <button
                                onClick={() => sendMessage('请各位对刚才的讨论做一个简短的总结。', 'summarize')}
                                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                                总结观点
                            </button>
                            <button
                                onClick={() => sendMessage('你们之间有没有互相不同意的地方？请指出来。')}
                                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                                挖掘分歧
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex items-center gap-2">
                        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-glow-card p-1.5">
                            <Input
                                value={input}
                                onChange={(val) => setInput(val)}
                                placeholder="发送新话题或追问..."
                                className="bg-transparent! border-none! shadow-none! text-[15px] text-gray-900 placeholder:text-gray-400"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                                        e.preventDefault();
                                        handleSubmit();
                                    }
                                }}
                                disabled={isLoading}
                            />
                        </div>
                        {isLoading ? (
                            <Button
                                type="outline"
                                onClick={stop}
                                shape="circle"
                                className="w-11 h-11 shrink-0"
                            >
                                ■
                            </Button>
                        ) : (
                            <Button
                                type="primary"
                                htmlType="submit"
                                shape="circle"
                                className="w-11 h-11 shrink-0"
                                icon={<IconSend />}
                                disabled={!input.trim()}
                            />
                        )}
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

/**
 * 主持人消息气泡
 */
function ModeratorBubble({ msg }: { msg: GroupMessage }) {
    const actionIcon = {
        opening: '🎬',
        point: '👉',
        transition: '🔄',
        synthesize: '📋',
    }[msg.moderatorAction || 'opening'];

    return (
        <div className="flex justify-center py-1">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-linear-to-r from-violet-50 to-indigo-50 border border-violet-100 max-w-[85%]">
                <span className="text-sm shrink-0">{actionIcon}</span>
                <span className="text-sm text-violet-700 font-medium leading-snug">
                    {msg.content}
                </span>
            </div>
        </div>
    );
}

/**
 * 总结消息气泡
 */
function SynthesisBubble({ msg }: { msg: GroupMessage }) {
    return (
        <div className="mx-auto max-w-[90%] mt-4">
            <div className="bg-linear-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📜</span>
                    <span className="text-sm font-bold text-amber-800">圆桌总结</span>
                </div>
                <div className="prose prose-sm max-w-none text-gray-800 prose-strong:text-amber-900 prose-p:my-1.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
            </div>
        </div>
    );
}

/**
 * 大师消息气泡组件
 */
function MentorMessageBubble({ msg, isStreaming }: { msg: GroupMessage; isStreaming: boolean }) {
    const bubbleColor = bubbleColorMap[msg.mentorColor || 'gray'] || 'bg-gray-50 border-gray-200';
    const nameColor = nameColorMap[msg.mentorColor || 'gray'] || 'text-gray-700';

    const cleanContent = (content: string) => {
        if (!content) return '';
        return content.replace(/^\[.*?\]:\s*/, '');
    };

    const displayContent = cleanContent(msg.content) || (isStreaming ? '...' : '');

    return (
        <div className="flex gap-3 max-w-[88%]">
            <div className="shrink-0 w-9 h-9 rounded-full bg-white flex items-center justify-center border border-gray-200 shadow-xs">
                <span className="text-lg">{msg.mentorAvatar || '🤔'}</span>
            </div>

            <div className="flex-1 min-w-0">
                <div className={cn("text-xs font-semibold mb-1", nameColor)}>
                    {msg.mentorName}
                    {isStreaming && (
                        <span className="ml-1.5 inline-flex items-center">
                            <span className="animate-pulse text-violet-500">●</span>
                        </span>
                    )}
                </div>

                <div className={cn(
                    "px-4 py-3 rounded-xl text-[15px] leading-relaxed shadow-xs border",
                    bubbleColor
                )}>
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 text-gray-800">
                        <ReactMarkdown>{displayContent}</ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * 活跃发言指示器
 */
function ActiveSpeakerIndicator({ mentorId }: { mentorId: string }) {
    const mentor = getMentor(mentorId);
    if (!mentor) return null;

    return (
        <div className="flex items-center gap-2 pl-12 text-xs text-gray-400">
            <span>{mentor.avatar}</span>
            <span>{mentor.name} 正在思考</span>
            <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
        </div>
    );
}
