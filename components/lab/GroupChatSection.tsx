'use client';

import React, { useState } from 'react';
import { MENTORS, MentorPersona } from '@/lib/ai/mentors/personas';
import { Button, Input } from '@arco-design/web-react';
import { cn } from '@/lib/utils/cn';
import { GroupChatWindow } from './GroupChatWindow';

type GroupMode = 'discuss' | 'debate';

export function GroupChatSection() {
    const [selectedMentors, setSelectedMentors] = useState<string[]>([]);
    const [topic, setTopic] = useState('');
    const [mode, setMode] = useState<GroupMode>('discuss');
    const [showChat, setShowChat] = useState(false);

    const toggleMentor = (id: string) => {
        setSelectedMentors(prev => {
            if (prev.includes(id)) {
                return prev.filter(m => m !== id);
            }
            if (prev.length >= 4) return prev; // 上限4位
            return [...prev, id];
        });
    };

    const canStart = selectedMentors.length >= 2 && topic.trim().length > 0;

    const handleStart = () => {
        if (!canStart) return;
        setShowChat(true);
    };

    // 获取颜色类名
    const getColorClasses = (mentor: MentorPersona, isSelected: boolean) => {
        if (!isSelected) return 'border-gray-200 bg-white';
        const colorMap: Record<string, string> = {
            slate: 'border-slate-400 bg-slate-50 ring-2 ring-slate-200',
            indigo: 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200',
            orange: 'border-orange-400 bg-orange-50 ring-2 ring-orange-200',
            yellow: 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200',
            rose: 'border-rose-400 bg-rose-50 ring-2 ring-rose-200',
            cyan: 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-200',
            emerald: 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200',
            zinc: 'border-zinc-400 bg-zinc-50 ring-2 ring-zinc-200',
            sky: 'border-sky-400 bg-sky-50 ring-2 ring-sky-200',
            amber: 'border-amber-400 bg-amber-50 ring-2 ring-amber-200',
        };
        return colorMap[mentor.themeColor] || 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-linear-to-r from-violet-50 to-indigo-50 rounded-xl p-6 border border-violet-100">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    🎭 圆桌论道 (Roundtable)
                    <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold border border-violet-200">NEW</span>
                </h2>
                <p className="text-sm text-gray-600 mt-2 max-w-lg">
                    邀请 2-4 位大师围绕一个话题共同<span className="font-semibold text-violet-700">讨论或辩论</span>。
                    <br />
                    <span className="opacity-80">观点碰撞中，真理越辩越明。</span>
                </p>
            </div>

            {/* 话题输入 */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">讨论话题 <span className="text-red-500">*</span></label>
                <Input
                    value={topic}
                    onChange={(val) => setTopic(val)}
                    placeholder="输入一个话题，例如：人应该追求自由还是安全？"
                    className="rounded-xl!"
                    maxLength={200}
                />
            </div>

            {/* 模式切换 */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">对话模式</label>
                <div className="flex gap-3">
                    <button
                        onClick={() => setMode('discuss')}
                        className={cn(
                            "flex-1 py-3 px-4 rounded-xl border-2 transition-all text-sm font-medium",
                            mode === 'discuss'
                                ? "border-violet-500 bg-violet-50 text-violet-700"
                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                        )}
                    >
                        <div className="text-lg mb-1">💬</div>
                        <div className="font-bold">讨论模式</div>
                        <div className="text-xs opacity-70 mt-0.5">自由对话，互相补充</div>
                    </button>
                    <button
                        onClick={() => setMode('debate')}
                        className={cn(
                            "flex-1 py-3 px-4 rounded-xl border-2 transition-all text-sm font-medium",
                            mode === 'debate'
                                ? "border-rose-500 bg-rose-50 text-rose-700"
                                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                        )}
                    >
                        <div className="text-lg mb-1">⚔️</div>
                        <div className="font-bold">辩论模式</div>
                        <div className="text-xs opacity-70 mt-0.5">正反交锋，观点碰撞</div>
                    </button>
                </div>
            </div>

            {/* 大师选择网格 */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                    选择大师
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                        已选 {selectedMentors.length}/4（至少选2位）
                    </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {MENTORS.map((mentor) => {
                        const isSelected = selectedMentors.includes(mentor.id);
                        const isDisabled = !isSelected && selectedMentors.length >= 4;

                        return (
                            <button
                                key={mentor.id}
                                onClick={() => !isDisabled && toggleMentor(mentor.id)}
                                disabled={isDisabled}
                                className={cn(
                                    "relative p-3 rounded-xl border-2 transition-all text-left",
                                    getColorClasses(mentor, isSelected),
                                    isDisabled
                                        ? "opacity-40 cursor-not-allowed"
                                        : "cursor-pointer hover:shadow-md"
                                )}
                            >
                                {/* 选中标记 */}
                                {isSelected && (
                                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 text-white flex items-center justify-center text-xs font-bold">
                                        {selectedMentors.indexOf(mentor.id) + 1}
                                    </div>
                                )}

                                <div className="text-2xl mb-1">{mentor.avatar}</div>
                                <div className="text-sm font-bold text-gray-900 truncate">{mentor.name}</div>
                                <div className="text-xs text-gray-500 truncate">{mentor.title}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 开始按钮 */}
            <div className="flex justify-center pt-2">
                <Button
                    type="primary"
                    size="large"
                    disabled={!canStart}
                    onClick={handleStart}
                    className={cn(
                        "rounded-xl! px-8! h-12! text-base! font-bold transition-all",
                        canStart
                            ? "bg-violet-600! hover:bg-violet-700! shadow-lg shadow-violet-200"
                            : ""
                    )}
                >
                    🎭 开始圆桌对话
                </Button>
            </div>

            {/* 群组对话窗口 */}
            {showChat && (
                <GroupChatWindow
                    mentorIds={selectedMentors}
                    mode={mode}
                    topic={topic}
                    onClose={() => setShowChat(false)}
                />
            )}
        </div>
    );
}
