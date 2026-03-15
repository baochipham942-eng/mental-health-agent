'use client';

import { useState, useEffect } from 'react';
import { Spin, Tag, Input, Button, Message, Modal } from '@arco-design/web-react';
import { IconEdit, IconDelete, IconSave, IconClose, IconRefresh } from '@arco-design/web-react/icon';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

// 记忆类型标签映射 - 优化视觉层次
const TOPIC_CONFIG: Record<string, {
    label: string;
    emoji: string;
    color: 'purple' | 'green' | 'blue' | 'orange' | 'red';
    bgClass: string;
    borderClass: string;
}> = {
    emotional_pattern: {
        label: '情绪模式',
        emoji: '📊',
        color: 'purple',
        bgClass: 'bg-purple-50',
        borderClass: 'border-purple-100',
    },
    coping_preference: {
        label: '偏好策略',
        emoji: '💡',
        color: 'green',
        bgClass: 'bg-green-50',
        borderClass: 'border-green-100',
    },
    personal_context: {
        label: '个人背景',
        emoji: '👤',
        color: 'blue',
        bgClass: 'bg-blue-50',
        borderClass: 'border-blue-100',
    },
    therapy_progress: {
        label: '成长记录',
        emoji: '📈',
        color: 'orange',
        bgClass: 'bg-orange-50',
        borderClass: 'border-orange-100',
    },
    trigger_warning: {
        label: '敏感话题',
        emoji: '⚠️',
        color: 'red',
        bgClass: 'bg-red-50',
        borderClass: 'border-red-100',
    },
};

// Tab顺序
const TAB_ORDER = ['emotional_pattern', 'coping_preference', 'personal_context', 'therapy_progress', 'trigger_warning'];

// V2 ProfileMemory kind → 前端 topic 映射
const KIND_TO_TOPIC: Record<string, string> = {
    trigger: 'trigger_warning',
    coping: 'coping_preference',
    preference: 'coping_preference',
    identity: 'personal_context',
    relationship: 'personal_context',
};

interface Memory {
    id: string;
    kind?: string;
    topic: string;
    content: string;
    confidence: number;
    createdAt: string;
    updatedAt: string;
    // Ebbinghaus fields
    memoryStrength?: number;
    accessCount?: number;
}

// 记忆强度可视化组件
const StrengthIndicator = ({ strength = 1.0, count = 1 }: { strength?: number; count?: number }) => {
    // 强度颜色：高(>0.7)绿，中(>0.4)黄，低(<0.4)红
    let color = 'bg-red-500';
    if (strength > 0.7) color = 'bg-green-500';
    else if (strength > 0.4) color = 'bg-yellow-500';

    return (
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
            <div className="flex items-center gap-1" title={`记忆强度: ${(strength * 100).toFixed(0)}%`}>
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${color}`}
                        style={{ width: `${strength * 100}%` }}
                    />
                </div>
                <span>{(strength * 100).toFixed(0)}%</span>
            </div>
            <span className="w-px h-3 bg-gray-200 mx-1" />
            <span title="提取次数">🔄 {count} 次回忆</span>
        </div>
    );
};

export function MemoryPageContent() {
    const router = useRouter();
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [activeTab, setActiveTab] = useState<string>('emotional_pattern');

    // 获取记忆列表
    const fetchMemories = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/memory');
            if (!res.ok) throw new Error('获取记忆失败');
            const data = await res.json();
            // API 返回 ProfileMemory（kind 字段），映射为前端 topic
            const mapped = (data.memories || []).map((m: any) => ({
                ...m,
                topic: m.topic || KIND_TO_TOPIC[m.kind] || 'personal_context',
            }));
            setMemories(mapped);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMemories();
    }, []);

    // 删除记忆
    const handleDelete = async (id: string) => {
        Modal.confirm({
            title: '确认删除',
            content: '确定要删除这条记忆吗？此操作不可撤销。',
            okButtonProps: { status: 'danger' },
            onOk: async () => {
                try {
                    const res = await fetch(`/api/memory?id=${id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('删除失败');
                    setMemories(prev => prev.filter(m => m.id !== id));
                    Message.success('删除成功');
                } catch (e: any) {
                    Message.error(e.message);
                }
            },
        });
    };

    // 开始编辑
    const startEdit = (memory: Memory) => {
        setEditingId(memory.id);
        setEditContent(memory.content);
    };

    // 保存编辑
    const saveEdit = async () => {
        if (!editingId || !editContent.trim()) return;

        try {
            const res = await fetch('/api/memory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId, content: editContent.trim() }),
            });
            if (!res.ok) throw new Error('保存失败');

            const data = await res.json();
            setMemories(prev => prev.map(m =>
                m.id === editingId ? { ...m, content: data.memory.content } : m
            ));
            setEditingId(null);
            setEditContent('');
            Message.success('保存成功');
        } catch (e: any) {
            Message.error(e.message);
        }
    };

    // 取消编辑
    const cancelEdit = () => {
        setEditingId(null);
        setEditContent('');
    };

    // 按topic分组（兼容 V2 kind 字段）
    const groupedMemories = memories.reduce((acc, memory) => {
        const topic = memory.topic || KIND_TO_TOPIC[memory.kind || ''] || 'personal_context';
        if (!acc[topic]) acc[topic] = [];
        acc[topic].push(memory);
        return acc;
    }, {} as Record<string, Memory[]>);

    // 当前Tab的记忆
    const currentMemories = groupedMemories[activeTab] || [];
    const currentConfig = TOPIC_CONFIG[activeTab];

    // 渲染单个记忆卡片
    const renderMemoryCard = (memory: Memory, topicConfig: typeof TOPIC_CONFIG[string]) => (
        <div
            key={memory.id}
            className={`group rounded-xl p-4 border transition-all ${topicConfig.bgClass} ${topicConfig.borderClass} hover:shadow-sm`}
        >
            {editingId === memory.id ? (
                <div className="space-y-3">
                    <Input.TextArea
                        value={editContent}
                        onChange={setEditContent}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        autoFocus
                        className="!bg-white"
                    />
                    <div className="flex gap-2 justify-end">
                        <Button
                            size="small"
                            icon={<IconClose />}
                            onClick={cancelEdit}
                        >
                            取消
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            icon={<IconSave />}
                            onClick={saveEdit}
                        >
                            保存
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <p className="text-sm text-gray-700 leading-relaxed">
                            {memory.content}
                        </p>
                        {/* Phase 3 Visualization: Memory Strength */}
                        <StrengthIndicator strength={memory.memoryStrength} count={memory.accessCount} />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-start">
                        <Button
                            type="text"
                            size="mini"
                            icon={<IconEdit />}
                            onClick={() => startEdit(memory)}
                        />
                        <Button
                            type="text"
                            size="mini"
                            status="danger"
                            icon={<IconDelete />}
                            onClick={() => handleDelete(memory.id)}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-gray-50">
            {/* 页面头部 - 与会话页保持一致的毛玻璃效果 */}
            <header className="w-full bg-white/80 backdrop-blur-sm border-b border-gray-100 z-20 shrink-0">
                <div className="w-full max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-gray-900">我的记忆</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Tag color="gray" size="small">共 {memories.length} 条</Tag>
                        {!loading && (
                            <Button
                                type="text"
                                size="small"
                                icon={<IconRefresh />}
                                onClick={fetchMemories}
                            />
                        )}
                    </div>
                </div>
            </header>

            {/* 内容区 */}
            <section className="flex-1 overflow-y-auto overscroll-contain w-full min-h-0 scrollbar-thin">
                <div className="w-full max-w-4xl mx-auto px-4 py-6 pb-12">
                    {/* Tab导航 - 类似Lab页面的胶囊切换 */}
                    <div className="flex justify-center mb-6">
                        <div className="bg-gray-100/80 p-1 rounded-full inline-flex flex-wrap gap-1 relative">
                            {TAB_ORDER.map(topic => {
                                const config = TOPIC_CONFIG[topic];
                                const count = groupedMemories[topic]?.length || 0;
                                return (
                                    <button
                                        key={topic}
                                        onClick={() => setActiveTab(topic)}
                                        className={cn(
                                            "py-1.5 px-3 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap",
                                            activeTab === topic
                                                ? "bg-white shadow-sm text-gray-800"
                                                : "text-gray-500 hover:text-gray-700"
                                        )}
                                    >
                                        <span>{config.emoji}</span>
                                        <span>{config.label}</span>
                                        {count > 0 && (
                                            <span className={cn(
                                                "text-[10px] px-1.5 py-0.5 rounded-full",
                                                activeTab === topic
                                                    ? "bg-gray-100 text-gray-600"
                                                    : "bg-gray-200/50 text-gray-400"
                                            )}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 页面说明 */}
                    <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                        <p className="text-sm text-indigo-700">
                            💡 记忆帮助我更好地了解你。这些信息来自你的对话，你可以随时编辑或删除。
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Spin size={32} tip="加载中..." />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="text-4xl mb-4">😢</div>
                            <p className="text-gray-600 mb-4">{error}</p>
                            <Button
                                type="primary"
                                icon={<IconRefresh />}
                                onClick={fetchMemories}
                            >
                                重试
                            </Button>
                        </div>
                    ) : memories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="text-6xl mb-4">🌱</div>
                            <h3 className="text-lg font-medium text-gray-700 mb-2">还没有记忆</h3>
                            <p className="text-sm text-gray-500 text-center max-w-md mb-6">
                                聊天过程中，我会记住对你重要的信息，下次聊起来更默契
                            </p>
                            <Button
                                type="primary"
                                onClick={() => router.push('/')}
                            >
                                开始对话
                            </Button>
                        </div>
                    ) : currentMemories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="text-5xl mb-4">{currentConfig?.emoji || '📝'}</div>
                            <h3 className="text-base font-medium text-gray-600 mb-2">暂无{currentConfig?.label || '此类'}记忆</h3>
                            <p className="text-sm text-gray-400">继续聊天，系统会自动记录</p>
                        </div>
                    ) : (
                        /* 当前Tab的记忆列表 */
                        <div className="space-y-3">
                            {currentMemories.map(memory => renderMemoryCard(memory, currentConfig))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

