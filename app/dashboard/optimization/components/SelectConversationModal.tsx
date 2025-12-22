'use client';

import { Modal, Table, Message } from '@arco-design/web-react';
import { useState, useEffect } from 'react';

interface PendingConversation {
    id: string;
    title: string;
    createdAt: string;
    messageCount: number;
}

interface SelectConversationModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (conversationIds: string[]) => void;
}

export default function SelectConversationModal({
    visible,
    onClose,
    onConfirm,
}: SelectConversationModalProps) {
    const [loading, setLoading] = useState(false);
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
            const res = await fetch('/api/optimization/pending-conversations?limit=50');
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

    const handleConfirm = () => {
        if (selectedRowKeys.length === 0) {
            Message.warning('请选择要添加的会话');
            return;
        }
        onConfirm(selectedRowKeys);
        onClose();
        setSelectedRowKeys([]);
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
            onCancel={onClose}
            onOk={handleConfirm}
            style={{ width: 800 }}
            okText={`添加到列表 (${selectedRowKeys.length})`}
            cancelText="取消"
        >
            <div className="mb-4">
                <p className="text-sm text-gray-600">
                    选择要加入评估列表的会话，添加后可以在列表中选择开始评估
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
                    onChange: (keys) => setSelectedRowKeys(keys as string[]),
                }}
            />
        </Modal>
    );
}
