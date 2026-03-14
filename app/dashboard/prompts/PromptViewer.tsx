'use client';

import { useState, useMemo } from 'react';
import { Tabs, Radio } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';

const TabPane = Tabs.TabPane;

// 按执行顺序排列的分类
const CATEGORIES = [
    { id: 'router', title: '① 路由层', items: ['groq', 'weakTriage', 'crisisFewShot'] },
    { id: 'core', title: '② 核心对话', items: ['support', 'crisis', 'assessmentLoop', 'assessmentConclusion', 'assessmentStreaming', 'assessmentFixer'] },
    { id: 'base', title: '③ 基础组件', items: ['identity', 'cbtProtocol', 'interactiveRules', 'safetyRules', 'ragFormatting'] },
    { id: 'dynamic', title: '④ 动态叠加', items: ['persona', 'eft', 'emotionAnalysis'] },
    { id: 'agents', title: '⑤ Agent 层', items: ['stateClassifier', 'safetyAgent', 'safetyObserver', 'qualityCheck', 'deescalation'] },
    { id: 'utility', title: '⑥ 后台任务', items: ['memory', 'memoryConsolidation', 'summary', 'sessionSummary', 'evaluation'] },
    { id: 'lab', title: '⑦ 实验室', items: ['mentors', 'mbti'] },
];

const ITEM_LABELS: Record<string, string> = {
    // ① 路由层
    groq: 'Groq 主路由',
    weakTriage: 'Triage 降级',
    crisisFewShot: '危机快筛 (Few-shot)',
    // ② 核心对话
    support: '日常支持对话',
    crisis: '危机干预对话',
    assessmentLoop: 'SCEB 要素收集',
    assessmentConclusion: '结论报告生成',
    assessmentStreaming: '流式结论输出',
    assessmentFixer: '结论格式修复',
    // ③ 基础组件
    identity: '角色身份',
    cbtProtocol: 'CBT 协议',
    interactiveRules: '交互规范',
    safetyRules: '安全红线',
    ragFormatting: '知识库引用格式',
    // ④ 动态叠加
    persona: '适性人格 (4 模式)',
    eft: '情绪聚焦 EFT',
    emotionAnalysis: '情绪识别 (7 维)',
    // ⑤ Agent 层
    stateClassifier: 'SCEB 进度判定',
    safetyAgent: '深度风险评估',
    safetyObserver: '实时风险监控 (旧)',
    qualityCheck: '回复质检',
    deescalation: '危机降级判定',
    // ⑥ 后台任务
    memory: '记忆提取',
    memoryConsolidation: '记忆去重合并',
    summary: '上下文压缩',
    sessionSummary: '督导报告',
    evaluation: '对话评测 (14 维)',
    // ⑦ 实验室
    mentors: '大师人格 (10 位)',
    mbti: 'MBTI 人格 (16 型)',
};

// 每个 Prompt 的触发时机说明
const ITEM_DESCRIPTIONS: Record<string, string> = {
    // ① 路由层
    groq: '⏱️ 触发时机：每条用户消息到达后的第一步。使用 Groq (Llama) 进行毫秒级快速分析，判断安全等级 (crisis/urgent/normal)、情绪标签、路由目标 (crisis/assessment/support) 及适性模式 (guardian/companion/guide/coach)。这是整个对话流程的"入口分流器"。',
    weakTriage: '⏱️ 触发时机：Groq 主路由不可用时的降级方案。使用轻量模型进行快速路由判断，输出精简 JSON。',
    crisisFewShot: '⏱️ 触发时机：安全关键路径 Layer 1。每条消息到达时立即执行，使用 DeepSeek few-shot 判断是否包含自杀/自伤意图（YES/NO），是整个安全体系的第一道防线。',
    // ② 核心对话
    support: '⏱️ 触发时机：当 Groq 路由结果为 route=support 时。这是最常用的对话模式，处理日常情感倾诉、问候、闲聊、初步关系建立等场景。',
    crisis: '⏱️ 触发时机：当 Groq 判定 safety=crisis 或 urgent 时，强制切换到此模式。AI 将进入"安全优先"状态，提供危机干预话术、热线信息，并引导用户远离危险。',
    assessmentLoop: '⏱️ 触发时机：当路由为 assessment 且处于 SCEB 要素收集阶段。引导用户渐进分享情境(S)、认知(C)、情绪(E)、行为(B)，每次只聚焦 1 个要素，收集齐后触发结论生成。',
    assessmentConclusion: '⏱️ 触发时机：当 Groq 路由结果为 route=assessment 且对话进入"结论阶段"时。用于生成结构化的心理评估报告，包含风险等级、核心议题、推荐行动卡片等。',
    assessmentStreaming: '⏱️ 触发时机：评估结论的流式版本，用于实时输出评估报告内容，提升用户等待体验。',
    assessmentFixer: '⏱️ 触发时机：当流式评估结论输出不完整或格式异常时，用于修复和补全缺失的评估字段。',
    // ③ 基础组件
    identity: '⏱️ 触发时机：作为所有对话模式的基础身份定义，嵌入到 support/crisis/assessment 等系统提示词中。定义 AI 的身份（心灵树洞）、专业基础（CBT）和核心行为准则。',
    cbtProtocol: '⏱️ 触发时机：嵌入到核心对话 prompt 中。定义 CBT 认知行为疗法的基本原则和实施框架。',
    interactiveRules: '⏱️ 触发时机：嵌入到核心对话 prompt 中。定义结构化交互规范，包括回复长度、格式、追问策略等。',
    safetyRules: '⏱️ 触发时机：嵌入到核心对话 prompt 中。定义安全准则，包括危机识别规则和资源转介标准。',
    ragFormatting: '⏱️ 触发时机：当对话中需要引用知识库内容时嵌入。规范知识库检索结果的引用格式和展示方式。',
    // ④ 动态叠加
    persona: '⏱️ 触发时机：叠加到 Support/Crisis 系统提示词之上。基于 Groq 返回的 adaptiveMode (guardian/companion/guide/coach)，动态注入对应的人格修饰指令，实现"一个 IP，多种状态"的适性人格。',
    eft: '⏱️ 触发时机：当 Groq 判定 emotion.score >= 7 且 needsValidation=true 时。暂时覆盖当前模式，进入"情绪聚焦疗法"状态，严禁建议、只做共情抱持，直到用户情绪平复。',
    emotionAnalysis: '⏱️ 触发时机：用于分析用户消息的情绪状态。识别 7 种情绪类型（焦虑、抑郁、愤怒、悲伤、恐惧、快乐、平静），输出 0-10 强度评分。',
    // ⑤ Agent 层
    stateClassifier: '⏱️ 触发时机：评估模式下每轮对话后执行。分析 SCEB 四要素的收集进度（0-100%），判断是否应结束评估并生成报告。是评估状态机的核心决策器。',
    safetyAgent: '⏱️ 触发时机：当 Triage 判定 safety ≠ normal 时触发。使用 DeepSeek 进行深度安全评估，输出 crisis/urgent/self-care/normal 分级和行为约束列表。',
    safetyObserver: '⏱️ 触发时机：旧版安全观察员（legacy），在新 Agent 架构之前使用。负责独立的安全风险评估，不参与对话。',
    qualityCheck: '⏱️ 触发时机：AI 回复生成后异步执行。使用 Groq 快速评估回复质量（0-10 分），检查是否匹配对话阶段、是否违反约束、情感基调是否合适。',
    deescalation: '⏱️ 触发时机：用户从危机状态发送新消息时。评估用户是否真正脱离危机，决定是否可以安全降级回普通对话模式。',
    // ⑥ 后台任务
    memory: '⏱️ 触发时机：后台异步执行，在对话结束或达到一定轮次后。从对话历史中原子化提取用户的长期特征（情绪模式、偏好策略、个人背景等），写入记忆库。',
    memoryConsolidation: '⏱️ 触发时机：记忆提取后执行。比较新提取的语义记忆与现有记忆，决定合并、更新或丢弃，避免记忆冗余和冲突。',
    summary: '⏱️ 触发时机：当对话历史过长（超过 Token 限制或设定轮次）时。将历史内容压缩为 300 字以内的精炼摘要，作为下一轮对话的上下文，实现"无限记忆"效果。',
    sessionSummary: '⏱️ 触发时机：会话结束时生成。由督导视角撰写专业的会话摘要报告，包含核心议题、情绪变化、使用的技术、风险评估等。',
    evaluation: '⏱️ 触发时机：用于评测系统。由资深督导视角对 AI 对话质量进行多维度评估（共情、专业性、安全、伦理等），输出评分和改进建议。',
    // ⑦ 实验室
    mentors: '⏱️ 触发时机：仅在"智慧殿堂"实验室功能中使用。用户主动选择与某位心理学大师（苏格拉底、荣格、阿德勒等）对话时，加载对应的角色系统提示词。',
    mbti: '⏱️ 触发时机：仅在"镜像回廊"实验室功能中使用。用户选择与某种 MBTI 人格类型对话时，加载对应的角色系统提示词，用于人格探索和自我认知练习。',
};

export function PromptViewer({ data }: { data: Record<string, string> }) {
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col overflow-hidden">
            {/* Header Level 1: Categories (按执行顺序) */}
            <div className="flex-none px-6 py-4 bg-gray-50 border-b border-gray-200">
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
            <div className="flex-none px-4 pt-1 border-b border-gray-100 bg-white shadow-sm overflow-x-auto">
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

            <div className="flex-1 overflow-auto p-4 bg-gray-50/50">
                <div className="bg-slate-900 rounded-lg p-4 shadow-inner min-h-full">
                    <pre className="text-sm font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
                        {data[activeTab] || '暂无内容'}
                    </pre>
                </div>
            </div>
        </div>
    );
}
