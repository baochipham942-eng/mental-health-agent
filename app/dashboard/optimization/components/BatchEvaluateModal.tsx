'use client';

import { Modal, Table, Message } from '@arco-design/web-react';
import { useState, useEffect } from 'react';

interface PendingConversation {
    id: string;
    title: string;
    createdAt: string;
    messageCount: number;
}

interface BatchEvaluateModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function BatchEvaluateModal({
    visible,
    onClose,
    onSuccess,
}: BatchEvaluateModalProps) {
    const [loading, setLoading] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [conversations, setConversations] = useState<PendingConversation[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

    // 加载待评估会话
    useEffect(() => {
        if (visible) {
            loadPendingConversations();
            setSelectedRowKeys([]);
        }
    }, [visible]);

    const loadPendingConversations = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/optimization/pending-conversations?limit=20');
            if (res.ok) {
                const data = await res.json();
                setConversations(data.conversations);
            } else {
                Message.error('加载失败');
            }
        } catch (error) {
            Message.error('加载失败');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (selectedRowKeys.length === 0) {
            Message.warning('请选择要评估的会话');
            return;
        }

        setEvaluating(true);
        Message.info(`开始评估 ${selectedRowKeys.length} 条会话，请稍候...`);

        try {
            // 使用同步API，等待评估完成
            const res = await fetch('/api/optimization/evaluate-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationIds: selectedRowKeys }),
            });

            if (res.ok) {
                const data = await res.json();
                Message.success(`评估完成！成功 ${data.success} 条，失败 ${data.failed} 条`);
                onSuccess();
                onClose();
                setSelectedRowKeys([]);
            } else {
                const error = await res.json();
                Message.error(`评估失败: ${error.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('[BatchModal] Evaluation failed:', error);
            Message.error('评估失败');
        } finally {
            setEvaluating(false);
        }
    };

    const columns = [
        {
            title: '会话标题',
            dataIndex: 'title',
            width: 300,
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (time: string) => new Date(time).toLocaleString('zh-CN'),
        },
        {
            title: '消息数',
            dataIndex: 'messageCount',
            width: 100,
        },
    ];

    return (
        <Modal
            title="选择待评估会话"
            visible={visible}
            onCancel={evaluating ? undefined : onClose}
            onOk={handleSubmit}
            confirmLoading={evaluating}
            style={{ width: 800 }}
            okText={evaluating ? '评估中...' : '开始评估'}
            cancelText="取消"
            maskClosable={!evaluating}
            closable={!evaluating}
        >
            <div className="mb-4">
                <p className="text-sm text-gray-600">
                    已选择 <span className="font-semibold text-blue-600">{selectedRowKeys.length}</span> 条会话
                    {selectedRowKeys.length > 0 && (
                        <span className="ml-2 text-gray-500">
                            （预计需要约 {Math.ceil(selectedRowKeys.length * 0.5)} 分钟）
                        </span>
                    )}
                </p>
            </div>

            <Table
                loading={loading}
                columns={columns}
                data={conversations}
                rowKey="id"
                pagination={false}
                scroll={{ y: 400 }}
                rowSelection={{
                    selectedRowKeys,
                    onChange: (selectedRowKeys) => {
                        setSelectedRowKeys(selectedRowKeys as string[]);
                    },
                }}
            />
        </Modal>
    );
}
