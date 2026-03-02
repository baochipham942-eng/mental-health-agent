'use client';

import { useState } from 'react';

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

interface CrisisTableProps {
    escalations: Escalation[];
}

export function CrisisTable({ escalations: initialEscalations }: CrisisTableProps) {
    const [escalations, setEscalations] = useState(initialEscalations);
    const [filter, setFilter] = useState<string>('ALL');
    const [loading, setLoading] = useState<string | null>(null);

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
                alert(`操作失败: ${err.error}`);
                return;
            }

            const { escalation } = await res.json();
            setEscalations(prev =>
                prev.map(e => e.id === id ? { ...e, ...escalation } : e)
            );
        } catch (error) {
            alert('网络错误，请重试');
        } finally {
            setLoading(null);
        }
    }

    function handleResolve(id: string) {
        const resolution = prompt('请输入处理说明（可选）:');
        updateStatus(id, 'RESOLVED', resolution || undefined);
    }

    const riskBadge = (level: string) => {
        if (level === 'crisis') {
            return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">危机</span>;
        }
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">紧急</span>;
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            PENDING: 'bg-red-100 text-red-800',
            ACKNOWLEDGED: 'bg-yellow-100 text-yellow-800',
            RESOLVED: 'bg-green-100 text-green-800',
            DISMISSED: 'bg-gray-100 text-gray-800',
        };
        const labelMap: Record<string, string> = {
            PENDING: '待处理',
            ACKNOWLEDGED: '已确认',
            RESOLVED: '已解决',
            DISMISSED: '已忽略',
        };
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`}>
                {labelMap[status] || status}
            </span>
        );
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

    return (
        <div>
            {/* 筛选 */}
            <div className="mb-4 flex gap-2">
                {['ALL', 'PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'].map(s => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                            filter === s
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        {s === 'ALL' ? '全部' : { PENDING: '待处理', ACKNOWLEDGED: '已确认', RESOLVED: '已解决', DISMISSED: '已忽略' }[s]}
                    </button>
                ))}
            </div>

            {/* 表格 */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">触发消息</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">风险</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">安全分</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                        暂无记录
                                    </td>
                                </tr>
                            )}
                            {filtered.map(e => (
                                <tr key={e.id} className={e.status === 'PENDING' ? 'bg-red-50/50' : ''}>
                                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                        {formatTime(e.createdAt)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                        {e.user?.nickname || e.user?.username || e.userId.slice(0, 8)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title={e.triggerMessage}>
                                        {e.triggerMessage.slice(0, 80)}{e.triggerMessage.length > 80 ? '...' : ''}
                                    </td>
                                    <td className="px-4 py-3">{riskBadge(e.riskLevel)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{e.safetyScore}</td>
                                    <td className="px-4 py-3">{statusBadge(e.status)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            {e.status === 'PENDING' && (
                                                <button
                                                    onClick={() => updateStatus(e.id, 'ACKNOWLEDGED')}
                                                    disabled={loading === e.id}
                                                    className="px-2.5 py-1 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-300 rounded hover:bg-yellow-100 disabled:opacity-50"
                                                >
                                                    确认
                                                </button>
                                            )}
                                            {(e.status === 'PENDING' || e.status === 'ACKNOWLEDGED') && (
                                                <button
                                                    onClick={() => handleResolve(e.id)}
                                                    disabled={loading === e.id}
                                                    className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded hover:bg-green-100 disabled:opacity-50"
                                                >
                                                    解决
                                                </button>
                                            )}
                                            {e.resolution && (
                                                <span className="text-xs text-gray-500 self-center" title={e.resolution}>
                                                    {e.resolution.slice(0, 20)}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
