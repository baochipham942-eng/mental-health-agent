'use client';

import { useState, useEffect, useCallback } from 'react';

interface DailyMetric {
    date: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorRate: number;
    requestCount: number;
}

interface ModelMetric {
    model: string;
    totalTokens: number;
    requestCount: number;
    errorCount: number;
    errorRate: number;
    avgLatencyMs: number;
}

interface Summary {
    totalRequests: number;
    totalTokens: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
}

export default function MetricsPage() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [daily, setDaily] = useState<DailyMetric[]>([]);
    const [byModel, setByModel] = useState<ModelMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/metrics/stats?days=${days}`);
            if (!res.ok) throw new Error('请求失败');
            const data = await res.json();
            setSummary(data.summary);
            setDaily(data.daily || []);
            setByModel(data.byModel || []);
        } catch (e) {
            console.error('加载指标数据失败:', e);
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const maxTokens = Math.max(...daily.map(d => d.totalTokens), 1);
    const maxLatency = Math.max(...daily.map(d => d.p95LatencyMs), 1);
    const chartW = 700;
    const chartH = 160;

    return (
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">观测统计</h2>
                    <p className="text-sm text-gray-500">Token 用量、响应延迟、错误率趋势</p>
                </div>
                <select
                    value={days}
                    onChange={e => setDays(Number(e.target.value))}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1"
                >
                    <option value={7}>近 7 天</option>
                    <option value={14}>近 14 天</option>
                    <option value={30}>近 30 天</option>
                    <option value={90}>近 90 天</option>
                </select>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-400">加载中...</div>
            ) : (
                <>
                    {/* 总览卡片 */}
                    {summary && (
                        <div className="grid grid-cols-5 gap-4">
                            <MetricCard label="总请求数" value={summary.totalRequests.toLocaleString()} />
                            <MetricCard label="总 Token" value={formatTokens(summary.totalTokens)} />
                            <MetricCard label="错误率" value={`${summary.errorRate}%`} warn={summary.errorRate > 5} />
                            <MetricCard label="平均延迟" value={`${summary.avgLatencyMs}ms`} />
                            <MetricCard label="P95 延迟" value={`${summary.p95LatencyMs}ms`} warn={summary.p95LatencyMs > 5000} />
                        </div>
                    )}

                    {/* Token 用量趋势 */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">Token 用量趋势</h3>
                        {daily.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 text-sm">暂无数据</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <svg width={chartW} height={chartH + 30}>
                                    {daily.map((d, i) => {
                                        const x = 50 + i * ((chartW - 50) / daily.length);
                                        const barW = Math.min(24, (chartW - 50) / daily.length - 4);
                                        const h = (d.totalTokens / maxTokens) * chartH;
                                        return (
                                            <g key={d.date}>
                                                <rect
                                                    x={x}
                                                    y={chartH - h}
                                                    width={barW}
                                                    height={h}
                                                    fill="#818cf8"
                                                    rx={2}
                                                />
                                                <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
                                                    {d.date.slice(5)}
                                                </text>
                                                <title>{`${d.date}: ${d.totalTokens.toLocaleString()} tokens, ${d.requestCount} 请求`}</title>
                                            </g>
                                        );
                                    })}
                                    {[0, 0.5, 1].map(ratio => (
                                        <g key={ratio}>
                                            <line x1={45} y1={chartH * (1 - ratio)} x2={chartW} y2={chartH * (1 - ratio)} stroke="#f3f4f6" />
                                            <text x={40} y={chartH * (1 - ratio) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                                                {formatTokens(Math.round(maxTokens * ratio))}
                                            </text>
                                        </g>
                                    ))}
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* 延迟趋势 */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">延迟趋势</h3>
                        {daily.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 text-sm">暂无数据</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <svg width={chartW} height={chartH + 30}>
                                    {/* P95 延迟折线 */}
                                    <polyline
                                        fill="none"
                                        stroke="#f97316"
                                        strokeWidth={2}
                                        points={daily.map((d, i) => {
                                            const x = 50 + i * ((chartW - 50) / daily.length) + 10;
                                            const y = chartH - (d.p95LatencyMs / maxLatency) * chartH;
                                            return `${x},${y}`;
                                        }).join(' ')}
                                    />
                                    {/* 平均延迟折线 */}
                                    <polyline
                                        fill="none"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        points={daily.map((d, i) => {
                                            const x = 50 + i * ((chartW - 50) / daily.length) + 10;
                                            const y = chartH - (d.avgLatencyMs / maxLatency) * chartH;
                                            return `${x},${y}`;
                                        }).join(' ')}
                                    />
                                    {daily.map((d, i) => {
                                        const x = 50 + i * ((chartW - 50) / daily.length) + 10;
                                        return (
                                            <text key={d.date} x={x} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
                                                {d.date.slice(5)}
                                            </text>
                                        );
                                    })}
                                    {[0, 0.5, 1].map(ratio => (
                                        <g key={ratio}>
                                            <line x1={45} y1={chartH * (1 - ratio)} x2={chartW} y2={chartH * (1 - ratio)} stroke="#f3f4f6" />
                                            <text x={40} y={chartH * (1 - ratio) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                                                {Math.round(maxLatency * ratio)}ms
                                            </text>
                                        </g>
                                    ))}
                                </svg>
                                <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" />平均延迟</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-500 inline-block" />P95 延迟</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 模型维度对比 */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">模型维度对比</h3>
                        {byModel.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 text-sm">暂无数据</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500 border-b">
                                        <th className="pb-2 font-medium">模型</th>
                                        <th className="pb-2 font-medium">请求数</th>
                                        <th className="pb-2 font-medium">总 Token</th>
                                        <th className="pb-2 font-medium">平均延迟</th>
                                        <th className="pb-2 font-medium">错误率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byModel.map(m => (
                                        <tr key={m.model} className="border-b border-gray-100">
                                            <td className="py-2 font-mono text-xs">{m.model}</td>
                                            <td className="py-2">{m.requestCount}</td>
                                            <td className="py-2">{formatTokens(m.totalTokens)}</td>
                                            <td className="py-2">{m.avgLatencyMs}ms</td>
                                            <td className="py-2">
                                                <span className={m.errorRate > 5 ? 'text-red-600 font-medium' : ''}>
                                                    {m.errorRate}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function MetricCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
    return (
        <div className={`rounded-lg p-4 ${warn ? 'bg-red-50' : 'bg-gray-50'}`}>
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-xl font-bold mt-1 ${warn ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
        </div>
    );
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}
