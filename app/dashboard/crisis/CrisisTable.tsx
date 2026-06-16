'use client';

import { useEffect, useState } from 'react';
import { Table, Tag, Button, Empty, Modal, Input, Message, Spin } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';

interface Escalation {
    id: string;
    userId: string;
    conversationId: string;
    triggerMessage: string;
    riskLevel: string;
    safetyScore: number;
    status: string;
    escalatedTo: string | null;
    resolution: string | null;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    createdAt: string;
    user: {
        id: string;
        username: string;
        nickname: string | null;
    };
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    PENDING: { label: '待处理', color: 'red' },
    ACKNOWLEDGED: { label: '已确认', color: 'orange' },
    RESOLVED: { label: '已解决', color: 'green' },
    DISMISSED: { label: '已忽略', color: 'gray' },
};

function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function CrisisTable() {
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    const [filter, setFilter] = useState<string>('ALL');
    const [loading, setLoading] = useState<string | null>(null);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        fetch('/api/crisis?limit=100')
            .then(async res => {
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || '加载失败');
                }
                return res.json();
            })
            .then(data => {
                if (!cancelled) setEscalations(data.escalations || []);
            })
            .catch(error => {
                if (!cancelled) Message.error(`危机记录加载失败: ${error.message}`);
            })
            .finally(() => {
                if (!cancelled) setInitialLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = filter === 'ALL'
        ? escalations
        : escalations.filter(e => e.status === filter);

    async function updateStatus(id: string, status: string, resolution?: string) {
        setLoading(id);
        try {
            const res = await fetch('/api/crisis', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status, resolution }),
            });

            if (!res.ok) {
                const err = await res.json();
                Message.error(`操作失败: ${err.error}`);
                return;
            }

            const { escalation } = await res.json();
            setEscalations(prev =>
                prev.map(e => e.id === id ? { ...e, ...escalation } : e)
            );
            Message.success('状态已更新');
        } catch {
            Message.error('网络错误，请重试');
        } finally {
            setLoading(null);
        }
    }

    function handleResolve(id: string) {
        let resolutionText = '';
        Modal.confirm({
            title: '处理说明',
            content: (
                <Input.TextArea
                    placeholder="请输入处理说明（可选）"
                    onChange={v => { resolutionText = v; }}
                    autoSize={{ minRows: 2 }}
                />
            ),
            onOk: () => updateStatus(id, 'RESOLVED', resolutionText || undefined),
        });
    }

    const columns: ColumnProps<Escalation>[] = [
        {
            title: '时间', dataIndex: 'createdAt', width: 120,
            render: (v: string) => <span className="text-sm text-gray-600">{formatTime(v)}</span>,
        },
        {
            title: '用户', dataIndex: 'user', width: 120,
            render: (_: any, record: Escalation) => (
                <span className="text-sm">{record.user?.nickname || record.user?.username || record.userId.slice(0, 8)}</span>
            ),
        },
        {
            title: '触发消息', dataIndex: 'triggerMessage', ellipsis: true,
            render: (v: string) => <span className="text-sm text-gray-700">{v}</span>,
        },
        {
            title: '风险', dataIndex: 'riskLevel', width: 80,
            render: (v: string) => (
                <Tag size="small" color={v === 'crisis' ? 'red' : 'orange'}>
                    {v === 'crisis' ? '危机' : '紧急'}
                </Tag>
            ),
        },
        {
            title: '安全分', dataIndex: 'safetyScore', width: 80, align: 'center',
            render: (v: number) => <span className="text-sm text-gray-600">{v}</span>,
        },
        {
            title: '状态', dataIndex: 'status', width: 90,
            render: (v: string) => {
                const conf = STATUS_CONFIG[v] || { label: v, color: 'gray' };
                return <Tag size="small" color={conf.color}>{conf.label}</Tag>;
            },
            filters: Object.entries(STATUS_CONFIG).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value: string, record: Escalation) => record.status === value,
        },
        {
            title: '操作', width: 160,
            render: (_: any, record: Escalation) => (
                <div className="flex gap-2">
                    {record.status === 'PENDING' && (
                        <Button size="mini" type="outline" status="warning"
                            loading={loading === record.id}
                            onClick={() => updateStatus(record.id, 'ACKNOWLEDGED')}>
                            确认
                        </Button>
                    )}
                    {(record.status === 'PENDING' || record.status === 'ACKNOWLEDGED') && (
                        <Button size="mini" type="outline" status="success"
                            loading={loading === record.id}
                            onClick={() => handleResolve(record.id)}>
                            解决
                        </Button>
                    )}
                    {record.resolution && (
                        <span className="text-xs text-gray-500 self-center" title={record.resolution}>
                            {record.resolution.slice(0, 20)}
                        </span>
                    )}
                </div>
            ),
        },
    ];

    const FILTER_OPTIONS = [
        { key: 'ALL', label: '全部' },
        ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k, label: v.label })),
    ];

    const pendingCount = escalations.filter(e => e.status === 'PENDING').length;
    const acknowledgedCount = escalations.filter(e => e.status === 'ACKNOWLEDGED').length;
    const resolvedCount = escalations.filter(e => e.status === 'RESOLVED').length;

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="待处理" count={pendingCount} color="red" loading={initialLoading} />
                <StatCard label="已确认" count={acknowledgedCount} color="yellow" loading={initialLoading} />
                <StatCard label="已解决" count={resolvedCount} color="green" loading={initialLoading} />
                <StatCard label="总计" count={escalations.length} color="gray" loading={initialLoading} />
            </div>

            <div className="mb-4 flex gap-2">
                {FILTER_OPTIONS.map(s => (
                    <Button
                        key={s.key}
                        size="small"
                        type={filter === s.key ? 'primary' : 'secondary'}
                        onClick={() => setFilter(s.key)}
                    >
                        {s.label}
                    </Button>
                ))}
            </div>

            <Table
                columns={columns}
                data={filtered}
                loading={initialLoading}
                rowKey="id"
                pagination={filtered.length > 20 ? { pageSize: 20 } : false}
                noDataElement={initialLoading ? <Spin /> : <Empty description="暂无记录" />}
                rowClassName={(record) => record.status === 'PENDING' ? 'bg-red-50/50' : ''}
            />
        </div>
    );
}

function StatCard({ label, count, color, loading }: { label: string; count: number; color: string; loading: boolean }) {
    const colorMap: Record<string, string> = {
        red: 'bg-red-50 text-red-700 border-red-200',
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        gray: 'bg-gray-50 text-gray-700 border-gray-200',
    };

    return (
        <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
            <p className="text-sm font-medium">{label}</p>
            {loading ? (
                <div className="mt-3 h-8 w-14 rounded bg-current/10 animate-pulse" aria-hidden="true" />
            ) : (
                <p className="text-3xl font-bold mt-1">{count}</p>
            )}
        </div>
    );
}
