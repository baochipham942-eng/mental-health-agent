'use client';

import React, { useState } from 'react';
import { MENTORS, MentorPersona } from '@/lib/ai/mentors/personas';
import { Button, Card } from '@arco-design/web-react';
import { MentorChatWindow } from './MentorChatWindow';
import { cn } from '@/lib/utils/cn';

export function MentorSection() {
    const [activeMentor, setActiveMentor] = useState<MentorPersona | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        🏛️ 智慧殿堂
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        与心理学历史上的伟人进行**跨时空对话**。
                        <br />
                        <span className="text-xs opacity-80">* 注：此为实验性功能，对话内容不会保存到历史记录。*</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {MENTORS.map((mentor) => (
                    <div
                        key={mentor.id}
                        onClick={() => setActiveMentor(mentor)}
                        className="group relative bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-indigo-300 transition-all duration-300 overflow-hidden"
                    >
                        {/* Background Decoration */}
                        <div className="absolute -right-6 -bottom-6 text-[8rem] opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all select-none grayscale group-hover:grayscale-0">
                            {mentor.avatar}
                        </div>

                        <div className="relative z-10 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform bg-white border">
                                    {mentor.avatar}
                                </div>
                                <div className={cn(
                                    "px-2 py-1 rounded text-xs font-medium",
                                    mentor.id === 'socrates' && "bg-slate-100 text-slate-600",
                                    mentor.id === 'jung' && "bg-indigo-100 text-indigo-600",
                                    mentor.id === 'adler' && "bg-orange-100 text-orange-600",
                                )}>
                                    {mentor.title}
                                </div>
                            </div>

                            <h3 className="text-base font-bold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
                                {mentor.name}
                            </h3>

                            <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">
                                {mentor.description}
                            </p>

                            <Button
                                type="outline"
                                size="small"
                                className="w-full border-gray-300 text-gray-600 group-hover:border-indigo-500 group-hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                            >
                                开始对话
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {activeMentor && (
                <MentorChatWindow
                    mentor={activeMentor}
                    onClose={() => setActiveMentor(null)}
                />
            )}
        </div>
    );
}
