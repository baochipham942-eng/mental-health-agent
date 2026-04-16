'use client';

import { useState, useEffect, useCallback } from 'react';
import DimensionRadar from '../components/DimensionRadar';

interface TrendPoint {
    date: string;
    passCount: number;
    warnCount: number;
    failCount: number;
    avgScore: number;
    total: number;
    autoCount: number;
    manualCount: number;
}

interface EvalItem {
    id: string;
    conversationId: string;
    title: string;
    grade: string;
    score: number;
    evaluatedAt: string;
    source: string;
}

interface DimensionAvg {
    legal: number;
    ethical: number;
    professional: number;
    ux: number;
}

interface InsightData {
    summary: string;
    provider: string;
    analyzedAt: string;
    suggestionCount: number;
    topSuggestions: string[];
}

interface AnnotationStats {
    total: number;
    agreed: number;
    disagreed: number;
}

export default function OnlineQualityPage() {
    const [trend, setTrend] = useState<TrendPoint[]>([]);
    const [recentEvals, setRecentEvals] = useState<EvalItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);
    const [cronStatus, setCronStatus] = useState<string>('');

    // 维度雷达图数据
    const [dimAvg, setDimAvg] = useState<DimensionAvg | null>(null);
    const [dimCount, setDimCount] = useState(0);

    // AI 洞察数据
    const [insight, setInsight] = useState<InsightData | null>(null);
    const [insightLoading, setInsightLoading] = useState(false);

    // 标注统计
    const [annotationStats, setAnnotationStats] = useState<AnnotationStats | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/eval/trend?days=${days}`);
            if (!res.ok) throw new Error('请求失败');
            const data = await res.json();
            setTrend(data.trend || []);
            setRecentEvals(data.recentEvaluations || []);
        } catch (e) {
            console.error('加载趋势数据失败:', e);
        } finally {
            setLoading(false);
        }
    }, [days]);

    // 加载维度统计
    const fetchDimensionStats = useCallback(async () => {
        try {
            const res = await fetch('/api/eval/dimension-stats?limit=20');
            if (!res.ok) return;
            const data = await res.json();
            if (data.count > 0) {
                setDimAvg(data.avg);
                setDimCount(data.count);
            }
        } catch (e) {
            console.error('加载维度统计失败:', e);
        }
    }, []);

    // 加载标注统计
    const fetchAnnotationStats = useCallback(async () => {
        try {
            const res = await fetch('/api/eval/annotations?stats=true');
            if (res.ok) {
                const data = await res.json();
                setAnnotationStats(data);
            }
        } catch (e) {
            console.error('加载标注统计失败:', e);
        }
    }, []);

    // 加载 AI 洞察（从最近的实验分析缓存中获取）
    const fetchInsight = useCallback(async () => {
        setInsightLoading(true);
        try {
            // 先获取实验列表，找到最近有失败的实验
            const runsRes = await fetch('/api/eval/runs');
            if (!runsRes.ok) return;
            const runsData = await runsRes.json();
            const runs = runsData.runs || [];
            const recentFailRun = runs.find((r: { failCount: number }) => r.failCount > 0);
            if (!recentFailRun) return;

            // 尝试读取该实验的分析缓存
            const analyzeRes = await fetch('/api/eval/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId: recentFailRun.runId, cacheOnly: true }),
            });
            if (!analyzeRes.ok) return;
            const analyzeData = await analyzeRes.json();
            if (analyzeData.suggestions?.length > 0) {
                setInsight({
                    summary: analyzeData.summary || '',
                    provider: analyzeData.provider || '',
                    analyzedAt: analyzeData.analyzedAt || '',
                    suggestionCount: analyzeData.suggestions.length,
                    topSuggestions: analyzeData.suggestions
                        .slice(0, 3)
                        .map((s: { title: string; description: string }) => `${s.title}: ${s.description}`),
                });
            }
        } catch (e) {
            console.error('加载 AI 洞察失败:', e);
        } finally {
            setInsightLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); fetchAnnotationStats(); }, [fetchData, fetchAnnotationStats]);
    useEffect(() => { fetchDimensionStats(); }, [fetchDimensionStats]);
    useEffect(() => { fetchInsight(); }, [fetchInsight]);

    const triggerCron = async () => {
        setCronStatus('执行中...');
        try {
            const res = await fetch('/api/cron/auto-eval', {
                headers: { Authorization: `Bearer ${prompt('输入 CRON_SECRET:')}` },
            });
            const data = await res.json();
            setCronStatus(res.ok ? `完成: ${data.total || 0} 条` : `失败: ${data.error}`);
            if (res.ok) fetchData();
        } catch {
            setCronStatus('请求失败');
        }
    };

    // SVG 趋势图
    const maxTotal = Math.max(...trend.map(t => t.total), 1);
    const chartW = 700;
    const chartH = 200;
    const barW = trend.length > 0 ? Math.min(30, (chartW - 40) / trend.length - 4) : 20;

    return (
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
            {/* 顶部操作栏 */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">线上质量监控</h2>
                    <p className="text-sm text-gray-500">自动评测结果趋势与低分对话追踪</p>
                </div>
                <div className="flex items-center gap-3">
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
                    <button
                        onClick={triggerCron}
                        className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                    >
                        手动触发评测
                    </button>
                    {cronStatus && (
                        <span className="text-xs text-gray-500">{cronStatus}</span>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-400">加载中...</div>
            ) : (
                <>
                    {/* 统计卡片 */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard
                            label="评估总数"
                            value={trend.reduce((s, t) => s + t.total, 0)}
                            color="gray"
                        />
                        <StatCard
                            label="通过 (A/B)"
                            value={trend.reduce((s, t) => s + t.passCount, 0)}
                            color="green"
                        />
                        <StatCard
                            label="警告 (C)"
                            value={trend.reduce((s, t) => s + t.warnCount, 0)}
                            color="yellow"
                        />
                        <StatCard
                            label="不通过 (D/F)"
                            value={trend.reduce((s, t) => s + t.failCount, 0)}
                            color="red"
                        />
                    </div>

                    {/* 标注进度卡片 */}
                    {annotationStats && annotationStats.total > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">标注进度</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="rounded-lg p-4 bg-indigo-50 text-indigo-700">
                                    <div className="text-xs opacity-70">总标注数</div>
                                    <div className="text-2xl font-bold mt-1">{annotationStats.total}</div>
                                </div>
                                <div className="rounded-lg p-4 bg-green-50 text-green-700">
                                    <div className="text-xs opacity-70">同意率</div>
                                    <div className="text-2xl font-bold mt-1">
                                        {annotationStats.total > 0
                                            ? `${Math.round((annotationStats.agreed / annotationStats.total) * 100)}%`
                                            : '-'}
                                    </div>
                                    <div className="text-xs mt-0.5 opacity-60">{annotationStats.agreed} 个同意</div>
                                </div>
                                <div className="rounded-lg p-4 bg-red-50 text-red-700">
                                    <div className="text-xs opacity-70">不同意数</div>
                                    <div className="text-2xl font-bold mt-1">{annotationStats.disagreed}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 趋势图 + 维度雷达图 并排 */}
                    <div className="grid grid-cols-3 gap-4">
                        {/* 趋势图 */}
                        <div className="col-span-2 bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-sm font-semibold text-gray-700 mb-4">评分趋势</h3>
                            {trend.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 text-sm">暂无数据</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <svg width={chartW} height={chartH + 40} className="mx-auto">
                                        {trend.map((t, i) => {
                                            const x = 40 + i * ((chartW - 40) / trend.length);
                                            const passH = (t.passCount / maxTotal) * chartH;
                                            const warnH = (t.warnCount / maxTotal) * chartH;
                                            const failH = (t.failCount / maxTotal) * chartH;
                                            const baseY = chartH;
                                            return (
                                                <g key={t.date}>
                                                    <rect x={x} y={baseY - passH - warnH - failH} width={barW} height={failH} fill="#ef4444" rx={2} />
                                                    <rect x={x} y={baseY - passH - warnH} width={barW} height={warnH} fill="#eab308" rx={0} />
                                                    <rect x={x} y={baseY - passH} width={barW} height={passH} fill="#22c55e" rx={2} />
                                                    <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={9} fill="#9ca3af">
                                                        {t.date.slice(5)}
                                                    </text>
                                                    <title>{`${t.date}: 通过${t.passCount} 警告${t.warnCount} 不通过${t.failCount} 均分${t.avgScore}`}</title>
                                                </g>
                                            );
                                        })}
                                        {/* Y 轴刻度 */}
                                        {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                                            <g key={ratio}>
                                                <line x1={35} y1={chartH * (1 - ratio)} x2={chartW} y2={chartH * (1 - ratio)} stroke="#f3f4f6" />
                                                <text x={30} y={chartH * (1 - ratio) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                                                    {Math.round(maxTotal * ratio)}
                                                </text>
                                            </g>
                                        ))}
                                    </svg>
                                    <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-xs bg-green-500 inline-block" />通过</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-xs bg-yellow-500 inline-block" />警告</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-xs bg-red-500 inline-block" />不通过</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 维度分布雷达图 */}
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">维度分布</h3>
                            {dimAvg ? (
                                <div className="flex flex-col items-center">
                                    <DimensionRadar
                                        scores={dimAvg}
                                        size={220}
                                    />
                                    <p className="text-xs text-gray-400 mt-2">
                                        基于最近 {dimCount} 条评估的平均分
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">
                                    暂无维度数据
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 全部评估列表 */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">
                            评估记录
                            <span className="ml-2 text-xs text-gray-400 font-normal">{recentEvals.length} 条</span>
                        </h3>
                        {recentEvals.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 text-sm">暂无评估记录</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-500 border-b">
                                            <th className="pb-2 font-medium">对话</th>
                                            <th className="pb-2 font-medium w-[60px]">评级</th>
                                            <th className="pb-2 font-medium w-[60px]">得分</th>
                                            <th className="pb-2 font-medium w-[60px]">来源</th>
                                            <th className="pb-2 font-medium w-[140px]">时间</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentEvals.map(item => (
                                            <tr
                                                key={item.id}
                                                className={`border-b border-gray-100 hover:bg-gray-50 ${
                                                    item.score < 6 ? 'bg-red-50/40' : ''
                                                }`}
                                            >
                                                <td className="py-2 max-w-[300px] truncate" title={item.conversationId}>
                                                    {item.title}
                                                </td>
                                                <td className="py-2">
                                                    <GradeBadge grade={item.grade} />
                                                </td>
                                                <td className="py-2 font-mono">{item.score.toFixed(1)}</td>
                                                <td className="py-2">
                                                    <SourceBadge source={item.source} />
                                                </td>
                                                <td className="py-2 text-gray-400 text-xs">
                                                    {new Date(item.evaluatedAt).toLocaleString('zh-CN')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* AI 洞察 */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4">AI 洞察</h3>
                        {insightLoading ? (
                            <div className="text-center py-6 text-gray-400 text-sm">加载分析数据...</div>
                        ) : insight ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                    <span>{insight.provider}</span>
                                    <span>·</span>
                                    <span>{new Date(insight.analyzedAt).toLocaleString('zh-CN')}</span>
                                    <span>·</span>
                                    <span>{insight.suggestionCount} 条建议</span>
                                </div>
                                <p className="text-sm text-gray-700">{insight.summary}</p>
                                {insight.topSuggestions.length > 0 && (
                                    <div className="space-y-1.5">
                                        <div className="text-xs text-gray-500 font-medium">关键发现:</div>
                                        {insight.topSuggestions.map((s, i) => (
                                            <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded-sm px-3 py-2">
                                                {s.length > 200 ? s.slice(0, 200) + '...' : s}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <a
                                    href="/dashboard/optimization/analysis"
                                    className="inline-block text-xs text-indigo-500 hover:text-indigo-700 hover:underline mt-1"
                                >
                                    查看完整分析 →
                                </a>
                            </div>
                        ) : (
                            <div className="text-center py-6">
                                <p className="text-sm text-gray-400 mb-3">暂无分析记录</p>
                                <a
                                    href="/dashboard/optimization/analysis"
                                    className="inline-block text-sm px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors"
                                >
                                    前往生成分析
                                </a>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    const colorMap: Record<string, string> = {
        gray: 'bg-gray-50 text-gray-700',
        green: 'bg-green-50 text-green-700',
        yellow: 'bg-yellow-50 text-yellow-700',
        red: 'bg-red-50 text-red-700',
    };
    return (
        <div className={`rounded-lg p-4 ${colorMap[color] || colorMap.gray}`}>
            <div className="text-xs opacity-70">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
    );
}

function GradeBadge({ grade }: { grade: string }) {
    const styles: Record<string, string> = {
        A: 'bg-green-100 text-green-800',
        B: 'bg-blue-100 text-blue-800',
        C: 'bg-yellow-100 text-yellow-800',
        D: 'bg-orange-100 text-orange-800',
        F: 'bg-red-100 text-red-800',
    };
    return (
        <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-medium ${styles[grade] || 'bg-gray-100 text-gray-600'}`}>
            {grade}
        </span>
    );
}

function SourceBadge({ source }: { source: string }) {
    const isAuto = source.startsWith('auto');
    return (
        <span className={`inline-block px-2 py-0.5 rounded-sm text-xs ${isAuto ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
            {isAuto ? '自动' : '手动'}
        </span>
    );
}
