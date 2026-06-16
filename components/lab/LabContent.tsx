'use client';

import React, { useState, useRef, useLayoutEffect, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils/cn';

type Tab = 'wisdom' | 'mirrors' | 'custom' | 'roundtable';

const MentorSection = lazy(() =>
    import('@/components/settings/MentorSection').then(module => ({ default: module.MentorSection }))
);
const MBTISection = lazy(() =>
    import('@/components/lab/MBTISection').then(module => ({ default: module.MBTISection }))
);
const CustomMasterSection = lazy(() =>
    import('@/components/lab/CustomMasterSection').then(module => ({ default: module.CustomMasterSection }))
);
const GroupChatSection = lazy(() =>
    import('@/components/lab/GroupChatSection').then(module => ({ default: module.GroupChatSection }))
);

function TabPanelFallback() {
    return (
        <div className="min-h-[360px] rounded-xl border border-gray-100 bg-white p-6">
            <div className="h-6 w-40 rounded bg-gray-100 animate-pulse" />
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[0, 1, 2].map(index => (
                    <div key={index} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
                ))}
            </div>
        </div>
    );
}

export function LabContent() {
    const [activeTab, setActiveTab] = useState<Tab>('wisdom');

    const tabs: { key: Tab; label: string; icon: string; activeColor: string }[] = [
        { key: 'mirrors', label: '镜像回廊', icon: '🪞', activeColor: 'text-purple-700' },
        { key: 'wisdom', label: '智慧殿堂', icon: '🏛️', activeColor: 'text-amber-700' },
        { key: 'roundtable', label: '圆桌论道', icon: '🎭', activeColor: 'text-violet-700' },
        { key: 'custom', label: '自定义大师', icon: '✨', activeColor: 'text-indigo-700' },
    ];

    // 测量真实按钮位置/宽度来定位高亮 pill，避免写死宽度导致热区与可见文字错位、指示器滞后
    const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
    const [pill, setPill] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

    useLayoutEffect(() => {
        const updatePill = () => {
            const el = tabRefs.current[activeTab];
            if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
        };
        updatePill();
        window.addEventListener('resize', updatePill);
        return () => window.removeEventListener('resize', updatePill);
    }, [activeTab]);

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
                    {/* Animated Background Pill - 宽度/位置由真实按钮测量得出 */}
                    <div
                        className="absolute top-1.5 bottom-1.5 rounded-full bg-white shadow-xs transition-all duration-300 ease-in-out pointer-events-none"
                        style={{ left: pill.left, width: pill.width, opacity: pill.width ? 1 : 0 }}
                    />

                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            ref={(el) => { tabRefs.current[tab.key] = el; }}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "relative z-10 py-2 px-4 rounded-full text-sm font-semibold transition-colors duration-300 flex items-center justify-center gap-1.5 whitespace-nowrap",
                                activeTab === tab.key
                                    ? tab.activeColor
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            <span>{tab.icon} {tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area - Full Width */}
            <div className="w-full min-h-[600px]">
                <Suspense fallback={<TabPanelFallback />}>
                    {activeTab === 'wisdom' && <MentorSection />}
                    {activeTab === 'mirrors' && <MBTISection />}
                    {activeTab === 'custom' && <CustomMasterSection />}
                    {activeTab === 'roundtable' && <GroupChatSection />}
                </Suspense>
            </div>
        </div>
    );
}
