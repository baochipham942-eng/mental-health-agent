'use client';

import React, { useState } from 'react';
import { MentorSection } from '@/components/settings/MentorSection';
import { MBTISection } from '@/components/lab/MBTISection';
import { CustomMasterSection } from '@/components/lab/CustomMasterSection';
import { GroupChatSection } from '@/components/lab/GroupChatSection';
import { cn } from '@/lib/utils/cn';

type Tab = 'wisdom' | 'mirrors' | 'custom' | 'roundtable';

export function LabContent() {
    const [activeTab, setActiveTab] = useState<Tab>('wisdom');

    const tabs: { key: Tab; label: string; icon: string; activeColor: string }[] = [
        { key: 'mirrors', label: '镜像回廊', icon: '🪞', activeColor: 'text-purple-700' },
        { key: 'wisdom', label: '智慧殿堂', icon: '🏛️', activeColor: 'text-amber-700' },
        { key: 'roundtable', label: '圆桌论道', icon: '🎭', activeColor: 'text-violet-700' },
        { key: 'custom', label: '自定义大师', icon: '✨', activeColor: 'text-indigo-700' },
    ];

    const tabWidth = 130;
    const activeIndex = tabs.findIndex(t => t.key === activeTab);
    const pillLeft = 6 + activeIndex * tabWidth; // 1.5 = 6px padding

    return (
        <div className="w-full">
            {/* 标题 */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">探索工坊</h1>
                <p className="text-sm text-gray-500 mt-1">大师对话 · MBTI 人格探索 · 圆桌论道</p>
            </div>

            {/* Tab Navigation */}
            <div className="flex justify-center mb-8">
                <div className="bg-gray-100/80 p-1.5 rounded-full inline-flex relative">
                    {/* Animated Background Pill */}
                    <div
                        className="absolute top-1.5 bottom-1.5 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out pointer-events-none"
                        style={{ left: pillLeft, width: tabWidth }}
                    />

                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "relative z-10 py-2 px-4 rounded-full text-sm font-semibold transition-colors duration-300 flex items-center justify-center gap-1.5",
                                activeTab === tab.key
                                    ? tab.activeColor
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                            style={{ width: tabWidth }}
                        >
                            <span>{tab.icon} {tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area - Full Width */}
            <div className="w-full min-h-[600px]">
                {activeTab === 'wisdom' && <MentorSection />}
                {activeTab === 'mirrors' && <MBTISection />}
                {activeTab === 'custom' && <CustomMasterSection />}
                {activeTab === 'roundtable' && <GroupChatSection />}
            </div>
        </div>
    );
}
