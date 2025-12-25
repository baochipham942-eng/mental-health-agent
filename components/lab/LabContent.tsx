'use client';

import React, { useState } from 'react';
import { MentorSection } from '@/components/settings/MentorSection';
import { MBTISection } from '@/components/lab/MBTISection';
import { cn } from '@/lib/utils/cn';

type Tab = 'wisdom' | 'mirrors';

export function LabContent() {
    const [activeTab, setActiveTab] = useState<Tab>('wisdom');

    return (
        <div className="w-full">
            {/* Tab Navigation */}
            <div className="flex justify-center mb-8">
                <div className="bg-gray-100/80 p-1.5 rounded-full inline-flex relative">
                    {/* Animated Background Pill */}
                    <div
                        className={cn(
                            "absolute top-1.5 bottom-1.5 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out",
                            activeTab === 'wisdom' ? "left-1.5 w-[140px]" : "left-[146px] w-[140px]" // 140px width + gap
                        )}
                    />

                    {/* Tab 1: Hall of Wisdom */}
                    <button
                        onClick={() => setActiveTab('wisdom')}
                        className={cn(
                            "relative z-10 w-[140px] py-2 px-4 rounded-full text-sm font-semibold transition-colors duration-300 flex items-center justify-center gap-2",
                            activeTab === 'wisdom'
                                ? "text-amber-700"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <span>🏛️ 智慧殿堂</span>
                    </button>

                    {/* Tab 2: Hall of Mirrors */}
                    <button
                        onClick={() => setActiveTab('mirrors')}
                        className={cn(
                            "relative z-10 w-[140px] py-2 px-4 rounded-full text-sm font-semibold transition-colors duration-300 flex items-center justify-center gap-2",
                            activeTab === 'mirrors'
                                ? "text-purple-700"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <span>🪞 镜像回廊</span>
                    </button>
                </div>
            </div>

            {/* Content Area - Full Width */}
            <div className="w-full min-h-[600px]">
                {activeTab === 'wisdom' ? (
                    <MentorSection />
                ) : (
                    <MBTISection />
                )}
            </div>
        </div>
    );
}
