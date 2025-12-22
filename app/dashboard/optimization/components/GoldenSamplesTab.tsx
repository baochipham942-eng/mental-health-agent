'use client';

import { useState, useEffect } from 'react';
import { Card, Table, Tag, Empty, Spin, Button, Message, Popconfirm } from '@arco-design/web-react';
import { IconStar, IconCheck, IconClose } from '@arco-design/web-react/icon';

interface GoldenSample {
    id: string;
    conversationId: string;
    messageId: string;
    content: string;
    reason?: string;
    createdAt: string;
    isApproved?: boolean;  // 是否已纳入 Prompt
}

interface GoldenSamplesTabProps {
    onRowClick?: (sample: GoldenSample) => void;
}

export default function GoldenSamplesTab({ onRowClick }: GoldenSamplesTabProps) {
    const [samples, setSamples] = useState<GoldenSample[]>([]);
    const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);

    useEffect(() => {
        loadSamples();
        loadApprovedExamples();
    }, [page]);

    const loadSamples = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/optimization/golden-samples?page=${page}&pageSize=20`);
            if (res.ok) {
                const data = await res.json();
                setSamples(data.samples);
                setTotal(data.total);
            }
        } catch (error) {
            console.error('Failed to load golden samples:', error);
        } finally {
            setLoading(false);
        }
    };

    // 加载已审批的样本，用于判断是否显示"已纳入"状态
    const loadApprovedExamples = async () => {
        try {
            const res = await fetch('/api/optimization/golden-examples');
            if (res.ok) {
                const data = await res.json();
                const ids = new Set<string>(data.examples?.map((e: any) => e.messageId) || []);
                setApprovedIds(ids);
            }
        } catch (error) {
            console.error('Failed to load approved examples:', error);
        }
    };

    // 纳入 Prompt
    const handleApprove = async (sample: GoldenSample, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await fetch('/api/optimization/golden-examples', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId: sample.messageId,
                    conversationId: sample.conversationId,
                    assistantMessage: sample.content,
                    userReason: sample.reason,
                })
            });
            if (res.ok) {
                Message.success('已纳入 Prompt，将在下次对话中生效');
                setApprovedIds(prev => new Set([...prev, sample.messageId]));
            } else {
                const data = await res.json();
                Message.warning(data.error || '纳入失败');
            }
        } catch (error) {
            Message.error('操作失败');
        }
    };

    const columns = [
        {
            title: '状态',
            width: 80,
            render: (_: any, record: GoldenSample) => {
                const isApproved = approvedIds.has(record.messageId);
                return isApproved ? (
                    <Tag color="green" icon={<IconCheck />}>已纳入</Tag>
                ) : (
                    <Tag color="gray">待审</Tag>
                );
            }
        },
        {
            title: '回复内容',
            dataIndex: 'content',
            render: (content: string) => (
                <div className="max-w-md truncate" title={content}>
                    {content.length > 100 ? content.substring(0, 100) + '...' : content}
                </div>
            )
        },
        {
            title: '点赞原因',
            dataIndex: 'reason',
            width: 150,
            render: (reason?: string) => reason || <span className="text-gray-400">未说明</span>
        },
        {
            title: '时间',
            dataIndex: 'createdAt',
            width: 120,
            render: (time: string) => new Date(time).toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        },
        {
            title: '操作',
            width: 120,
            render: (_: any, record: GoldenSample) => {
                const isApproved = approvedIds.has(record.messageId);
                if (isApproved) {
                    return <span className="text-gray-400 text-sm">—</span>;
                }
                return (
                    <Popconfirm
                        title="确认纳入 Prompt？"
                        content="该回复将作为 Few-Shot 示例注入到 AI 回复中"
                        onOk={(e) => handleApprove(record, e as React.MouseEvent)}
                    >
                        <Button
                            size="mini"
                            type="primary"
                            icon={<IconStar />}
                            onClick={(e) => e.stopPropagation()}
                        >
                            纳入 Prompt
                        </Button>
                    </Popconfirm>
                );
            }
        },
    ];

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spin size={32} />
            </div>
        );
    }

    return (
        <Card className="shadow-md">
            <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-600">
                    共 <strong>{total}</strong> 条黄金样本（用户点赞的高质量回复）
                    {approvedIds.size > 0 && (
                        <span className="ml-2 text-green-600">
                            · 已纳入 <strong>{approvedIds.size}</strong> 条
                        </span>
                    )}
                </div>
            </div>

            {samples.length === 0 ? (
                <Empty
                    icon={<IconStar style={{ fontSize: 48, color: '#ffc53d' }} />}
                    description="暂无黄金样本，用户点赞的回复会自动收集到这里"
                />
            ) : (
                <Table
                    data={samples}
                    columns={columns}
                    rowKey="id"
                    pagination={{
                        current: page,
                        total,
                        pageSize: 20,
                        onChange: setPage,
                    }}
                    onRow={(record) => ({
                        onClick: () => onRowClick?.(record),
                        style: { cursor: 'pointer' }
                    })}
                />
            )}
        </Card>
    );
}
