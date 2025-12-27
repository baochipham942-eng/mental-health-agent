'use client';

import { useState, useMemo } from 'react';
import { Tabs, Radio } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';

const TabPane = Tabs.TabPane;

interface PromptData {
    support: string;
    crisis: string;
    groq: string;
    assessment: string;
    persona: string;
    memory: string;
    eft: string;
    summary: string;
    mentors: string;
    mbti: string;
}

const CATEGORIES = [
    { id: 'core', title: '核心系统', items: ['support', 'crisis', 'groq', 'assessment'] },
    { id: 'dynamic', title: '人格修饰', items: ['persona', 'eft'] },
    { id: 'lab', title: '实验室', items: ['mentors', 'mbti'] },
    { id: 'utility', title: '后台工具', items: ['memory', 'summary'] },
];

const ITEM_LABELS: Record<string, string> = {
    support: '支持性对话 (Support)',
    crisis: '危机干预 (Crisis)',
    groq: 'Groq 分析 (Analysis)',
    assessment: '评估结论 (Assessment)',
    persona: '人格修饰 (Persona)',
    eft: '深度共情 (EFT)',
    mentors: '大师人格 (Mentors)',
    mbti: 'MBTI 人格 (MBTI)',
    memory: '记忆提取 (Memory)',
    summary: '对话摘要 (Summary)',
};

export function PromptViewer({ data }: { data: PromptData }) {
    const [activeCategory, setActiveCategory] = useState('core');
    const [activeTab, setActiveTab] = useState('support');

    const currentCategory = useMemo(() =>
        CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0]
        , [activeCategory]);

    const handleCategoryChange = (val: string) => {
        setActiveCategory(val);
        // Reset to first item of new category
        const target = CATEGORIES.find(c => c.id === val);
        if (target) {
            setActiveTab(target.items[0]);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden">
            {/* Header Level 1: Categories */}
            <div className="flex-none px-6 py-4 bg-slate-50 border-b border-slate-200">
                <Radio.Group
                    type="button"
                    name="category"
                    value={activeCategory}
                    onChange={handleCategoryChange}
                    className="flex flex-wrap gap-2"
                >
                    {CATEGORIES.map(cat => (
                        <Radio key={cat.id} value={cat.id}>
                            {cat.title}
                        </Radio>
                    ))}
                </Radio.Group>
            </div>

            {/* Header Level 2: Items in Category */}
            <div className="flex-none px-4 pt-1 border-b border-slate-100 bg-white shadow-sm overflow-x-auto">
                <Tabs activeTab={activeTab} onChange={setActiveTab} type="line">
                    {currentCategory.items.map(item => (
                        <TabPane key={item} title={ITEM_LABELS[item] || item} />
                    ))}
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
