'use client';

import { useState, useEffect } from 'react';
import { Modal, Spin, Empty, Tag, Collapse, Input, Button, Message } from '@arco-design/web-react';
import { IconEdit, IconDelete, IconSave, IconClose } from '@arco-design/web-react/icon';

// 记忆类型标签映射
const TOPIC_LABELS: Record<string, { label: string; emoji: string; color: 'purple' | 'green' | 'blue' | 'orange' | 'red' }> = {
    emotional_pattern: { label: '情绪模式', emoji: '📊', color: 'purple' },
    coping_preference: { label: '偏好策略', emoji: '💡', color: 'green' },
    personal_context: { label: '个人背景', emoji: '👤', color: 'blue' },
    therapy_progress: { label: '成长记录', emoji: '📈', color: 'orange' },
    trigger_warning: { label: '敏感话题', emoji: '⚠️', color: 'red' },
};

interface Memory {
    id: string;
    topic: string;
    content: string;
    confidence: number;
    createdAt: string;
    updatedAt: string;
}

export function MemoryManagement({ onClose }: { onClose?: () => void }) {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    // 获取记忆列表
    const fetchMemories = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/memory');
            if (!res.ok) throw new Error('获取记忆失败');
            const data = await res.json();
            setMemories(data.memories || []);
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

    // 按topic分组
    const groupedMemories = memories.reduce((acc, memory) => {
        const topic = memory.topic;
        if (!acc[topic]) acc[topic] = [];
        acc[topic].push(memory);
        return acc;
    }, {} as Record<string, Memory[]>);

    // 生成折叠面板数据
    const collapseItems = Object.entries(groupedMemories).map(([topic, items]) => {
        const topicInfo = TOPIC_LABELS[topic] || {
            label: topic,
            emoji: '📝',
            color: 'blue' as const,
        };

        return {
            key: topic,
            header: (
                <div className="flex items-center gap-2">
                    <span className="text-lg">{topicInfo.emoji}</span>
                    <Tag color={topicInfo.color} size="small">
                        {topicInfo.label}
                    </Tag>
                    <span className="text-xs text-gray-400">({items.length})</span>
                </div>
            ),
            content: (
                <div className="space-y-3">
                    {items.map(memory => (
                        <div
                            key={memory.id}
                            className="group bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors"
                        >
                            {editingId === memory.id ? (
                                <div className="space-y-3">
                                    <Input.TextArea
                                        value={editContent}
                                        onChange={setEditContent}
                                        autoSize={{ minRows: 2, maxRows: 6 }}
                                        autoFocus
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
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm text-gray-700 flex-1 leading-relaxed">
                                        {memory.content}
                                    </p>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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
                    ))}
                </div>
            ),
        };
    });

    return (
        <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* 头部 */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🧠</span>
                    <h2 className="text-lg font-semibold text-gray-800">我的记忆</h2>
                    <Tag color="gray" size="small">共 {memories.length} 条</Tag>
                </div>
                {onClose && (
                    <Button
                        type="text"
                        icon={<IconClose style={{ fontSize: 18 }} />}
                        onClick={onClose}
                    />
                )}
            </div>

            {/* 内容区 - min-h-0 is critical for flex child scrolling */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Spin size={32} tip="加载中..." />
                    </div>
                ) : error ? (
                    <div className="text-center py-8">
                        <Empty description={error} />
                        <Button
                            type="primary"
                            onClick={fetchMemories}
                            className="mt-4"
                        >
                            重试
                        </Button>
                    </div>
                ) : memories.length === 0 ? (
                    <Empty
                        icon={<span className="text-4xl">🌱</span>}
                        description={
                            <div className="text-center">
                                <p className="text-gray-500">还没有记忆</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    聊天过程中，我会记住对你重要的信息
                                </p>
                            </div>
                        }
                    />
                ) : (
                    <Collapse
                        defaultActiveKey={Object.keys(groupedMemories)}
                        bordered={false}
                        style={{ background: 'transparent' }}
                    >
                        {collapseItems.map(item => (
                            <Collapse.Item
                                key={item.key}
                                name={item.key}
                                header={item.header}
                                style={{ marginBottom: 8 }}
                            >
                                {item.content}
                            </Collapse.Item>
                        ))}
                    </Collapse>
                )}
            </div>

            {/* 底部说明 */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex-shrink-0">
                <p className="text-xs text-gray-500 text-center">
                    💡 记忆帮助我更好地了解你，你可以随时编辑或删除
                </p>
            </div>
        </div>
    );
}
