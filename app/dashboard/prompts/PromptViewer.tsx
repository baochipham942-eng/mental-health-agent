'use client';

import { useState } from 'react';
import { Tabs } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';

const TabPane = Tabs.TabPane;

interface PromptData {
    support: string;
    crisis: string;
    groq: string;
    assessment: string;
}

export function PromptViewer({ data }: { data: PromptData }) {
    const [activeTab, setActiveTab] = useState('support');

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden">
            <div className="flex-none px-4 pt-2 border-b border-slate-100">
                <Tabs activeTab={activeTab} onChange={setActiveTab} type="line">
                    <TabPane key="support" title="支持性对话 (Support)" />
                    <TabPane key="crisis" title="危机干预 (Crisis)" />
                    <TabPane key="groq" title="Groq 分析 (Analysis)" />
                    <TabPane key="assessment" title="评估结论 (Assessment)" />
                </Tabs>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-50/50">
                <div className="bg-slate-900 rounded-lg p-4 shadow-inner min-h-full">
                    <pre className="text-sm font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
                        {data[activeTab as keyof PromptData]}
                    </pre>
                </div>
            </div>
        </div>
    );
}
