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

// 按执行顺序排列的分类
const CATEGORIES = [
    { id: 'router', title: '① 路由层', items: ['groq'] },
    { id: 'core', title: '② 核心对话', items: ['support', 'crisis', 'assessment'] },
    { id: 'dynamic', title: '③ 动态叠加', items: ['persona', 'eft'] },
    { id: 'utility', title: '④ 后台任务', items: ['memory', 'summary'] },
    { id: 'lab', title: '⑤ 实验室', items: ['mentors', 'mbti'] },
];

const ITEM_LABELS: Record<string, string> = {
    groq: 'Groq 快速分析',
    support: '支持性对话',
    crisis: '危机干预',
    assessment: '评估结论',
    persona: '人格修饰器',
    eft: '深度共情 (EFT)',
    memory: '记忆提取',
    summary: '对话摘要',
    mentors: '大师人格',
    mbti: 'MBTI 人格',
};

// 每个 Prompt 的触发时机说明
const ITEM_DESCRIPTIONS: Record<string, string> = {
    groq: '⏱️ 触发时机：每条用户消息到达后的第一步。使用 Groq (Llama) 进行毫秒级快速分析，判断安全等级 (crisis/urgent/normal)、情绪标签、路由目标 (crisis/assessment/support) 及适性模式 (guardian/companion/guide/coach)。这是整个对话流程的"入口分流器"。',
    support: '⏱️ 触发时机：当 Groq 路由结果为 route=support 时。这是最常用的对话模式，处理日常情感倾诉、问候、闲聊、初步关系建立等场景。',
    crisis: '⏱️ 触发时机：当 Groq 判定 safety=crisis 或 urgent 时，强制切换到此模式。AI 将进入"安全优先"状态，提供危机干预话术、热线信息，并引导用户远离危险。',
    assessment: '⏱️ 触发时机：当 Groq 路由结果为 route=assessment 且对话进入"结论阶段"时。用于生成结构化的心理评估报告，包含风险等级、核心议题、推荐行动卡片等。',
    persona: '⏱️ 触发时机：叠加到 Support/Crisis 系统提示词之上。基于 Groq 返回的 adaptiveMode (guardian/companion/guide/coach)，动态注入对应的人格修饰指令，实现"一个 IP，多种状态"的适性人格。',
    eft: '⏱️ 触发时机：当 Groq 判定 emotion.score >= 7 且 needsValidation=true 时。暂时覆盖当前模式，进入"情绪聚焦疗法"状态，严禁建议、只做共情抱持，直到用户情绪平复。',
    memory: '⏱️ 触发时机：后台异步执行，在对话结束或达到一定轮次后。从对话历史中原子化提取用户的长期特征（情绪模式、偏好策略、个人背景等），写入记忆库。',
    summary: '⏱️ 触发时机：当对话历史过长（超过 Token 限制或设定轮次）时。将历史内容压缩为 300 字以内的精炼摘要，作为下一轮对话的上下文，实现"无限记忆"效果。',
    mentors: '⏱️ 触发时机：仅在"智慧殿堂"实验室功能中使用。用户主动选择与某位心理学大师（苏格拉底、荣格、阿德勒等）对话时，加载对应的角色系统提示词。',
    mbti: '⏱️ 触发时机：仅在"镜像回廊"实验室功能中使用。用户选择与某种 MBTI 人格类型对话时，加载对应的角色系统提示词，用于人格探索和自我认知练习。',
};

export function PromptViewer({ data }: { data: PromptData }) {
    const [activeCategory, setActiveCategory] = useState('router');
    const [activeTab, setActiveTab] = useState('groq');

    const currentCategory = useMemo(() =>
        CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0]
        , [activeCategory]);

    const handleCategoryChange = (val: string) => {
        setActiveCategory(val);
        const target = CATEGORIES.find(c => c.id === val);
        if (target) {
            setActiveTab(target.items[0]);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden">
            {/* Header Level 1: Categories (按执行顺序) */}
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

            {/* Description Banner */}
            <div className="flex-none px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                <p className="text-sm text-indigo-800 leading-relaxed">
                    {ITEM_DESCRIPTIONS[activeTab] || '暂无描述'}
                </p>
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
