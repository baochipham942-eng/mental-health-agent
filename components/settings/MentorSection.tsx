'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { MENTORS, MentorPersona } from '@/lib/ai/mentors/personas';
import { Button, Card } from '@arco-design/web-react';
import { cn } from '@/lib/utils/cn';

const MentorChatWindow = dynamic(() => import('./MentorChatWindow').then(mod => mod.MentorChatWindow), {
    ssr: false,
});

export function MentorSection() {
    const [activeMentor, setActiveMentor] = useState<MentorPersona | null>(null);

    return (
        <div className="space-y-6">
            {/* Header Area - Gold Theme */}
            <div className="bg-linear-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            🏛️ 智慧殿堂 (Hall of Wisdom)
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">NEW</span>
                        </h2>
                        <p className="text-sm text-gray-600 mt-2 max-w-lg">
                            与心理学历史上的伟人进行<span className="font-semibold text-amber-700">跨时空对话</span>。
                            <br />
                            <span className="opacity-80">在这里，没有标准答案，只有关于人生、意义与自我的深度启迪。</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-3xl shadow-xs group-hover:scale-110 transition-transform bg-white border">
                                    {mentor.avatar}
                                </div>
                                <div className={cn(
                                    "px-2 py-1 rounded-sm text-xs font-medium",
                                    mentor.themeColor === 'slate' && "bg-slate-100 text-slate-600",
                                    mentor.themeColor === 'indigo' && "bg-indigo-100 text-indigo-600",
                                    mentor.themeColor === 'orange' && "bg-orange-100 text-orange-600",
                                    mentor.themeColor === 'yellow' && "bg-yellow-100 text-yellow-700",
                                    mentor.themeColor === 'rose' && "bg-rose-100 text-rose-600",
                                    mentor.themeColor === 'cyan' && "bg-cyan-100 text-cyan-700",
                                    mentor.themeColor === 'emerald' && "bg-emerald-100 text-emerald-700",
                                    mentor.themeColor === 'zinc' && "bg-zinc-100 text-zinc-600",
                                    mentor.themeColor === 'sky' && "bg-sky-100 text-sky-700",
                                    mentor.themeColor === 'amber' && "bg-amber-100 text-amber-700",
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
                                className="w-full border-gray-300 text-gray-600 group-hover:border-indigo-500 group-hover:text-indigo-600 hover:bg-indigo-50 transition-all rounded-xl!"
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
