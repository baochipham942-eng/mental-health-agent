'use client';

import { useState, useEffect } from 'react';
import { Card, Table, Tag, Empty, Spin, Button, Message } from '@arco-design/web-react';
import { IconExclamationCircle, IconThumbDown, IconLoop } from '@arco-design/web-react/icon';

interface OptimizationEvent {
    id: string;
    conversationId: string;
    type: 'LOW_SCORE' | 'NEGATIVE_FEEDBACK' | 'STUCK_LOOP';
    subType?: string;
    triggerMessageId?: string;
    severity: number;
    summary: string;
    details?: Record<string, any>;
    status: 'PENDING' | 'PROCESSED' | 'IGNORED';
    resolution?: string;
    createdAt: string;
}

interface EventFeedTabProps {
    type: 'LOW_SCORE' | 'NEGATIVE_FEEDBACK' | 'STUCK_LOOP';
    onRowClick?: (event: OptimizationEvent) => void;
}

const TYPE_CONFIG = {
    LOW_SCORE: {
        icon: <IconExclamationCircle />,
        color: 'orange',
        label: '低分会话'
    },
    NEGATIVE_FEEDBACK: {
        icon: <IconThumbDown />,
        color: 'red',
        label: '差评反馈'
    },
    STUCK_LOOP: {
        icon: <IconLoop />,
        color: 'purple',
        label: '死循环'
    },
};

export default function EventFeedTab({ type, onRowClick }: EventFeedTabProps) {
    const [events, setEvents] = useState<OptimizationEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);

    const config = TYPE_CONFIG[type];

    useEffect(() => {
        loadEvents();
    }, [type, page]);

    const loadEvents = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/optimization/events?type=${type}&status=ALL&page=${page}&pageSize=20`);
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events);
                setTotal(data.total);
            }
        } catch (error) {
            console.error('Failed to load events:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkProcessed = async (eventId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await fetch('/api/optimization/events', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId, status: 'PROCESSED' })
            });
            if (res.ok) {
                Message.success('已标记为已处理');
                loadEvents();
            }
        } catch (error) {
            Message.error('操作失败');
        }
    };

    const handleIgnore = async (eventId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await fetch('/api/optimization/events', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId, status: 'IGNORED' })
            });
            if (res.ok) {
                Message.info('已忽略');
                loadEvents();
            }
        } catch (error) {
            Message.error('操作失败');
        }
    };

    const columns = [
        {
            title: '严重度',
            dataIndex: 'severity',
            width: 80,
            render: (severity: number) => (
                <Tag color={severity >= 7 ? 'red' : severity >= 4 ? 'orange' : 'gray'}>
                    {severity}/10
                </Tag>
            )
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            render: (summary: string, record: OptimizationEvent) => (
                <div className={record.status !== 'PENDING' ? 'opacity-50' : ''}>
                    <div className="font-medium text-gray-800">{summary}</div>
                    {record.subType && (
                        <Tag size="small" className="mt-1">{record.subType}</Tag>
                    )}
                </div>
            )
        },
        {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (status: string) => {
                const statusMap: Record<string, { color: string; text: string }> = {
                    PENDING: { color: 'orange', text: '待处理' },
                    PROCESSED: { color: 'green', text: '已处理' },
                    IGNORED: { color: 'gray', text: '已忽略' },
                };
                const config = statusMap[status] || { color: 'gray', text: status };
                return <Tag color={config.color}>{config.text}</Tag>;
            }
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
            width: 150,
            render: (_: any, record: OptimizationEvent) => {
                if (record.status !== 'PENDING') {
                    return <span className="text-gray-400 text-sm">—</span>;
                }
                return (
                    <div className="flex gap-2">
                        <Button
                            size="mini"
                            type="primary"
                            onClick={(e) => handleMarkProcessed(record.id, e)}
                        >
                            已处理
                        </Button>
                        <Button
                            size="mini"
                            type="text"
                            onClick={(e) => handleIgnore(record.id, e)}
                        >
                            忽略
                        </Button>
                    </div>
                );
            }
        }
    ];

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spin size={32} />
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <Empty
                icon={config.icon}
                description={`暂无${config.label}事件`}
            />
        );
    }

    return (
        <Card className="shadow-md">
            <Table
                data={events}
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
        </Card>
    );
}
