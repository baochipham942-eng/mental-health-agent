'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Tag, Select, Table, Empty, Spin, Message } from '@arco-design/web-react';
import { IconArrowLeft } from '@arco-design/web-react/icon';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

/* ---------- Types ---------- */

interface VersionOption {
  id: string;
  name: string;
  hash: string;
  createdAt: string;
  evalCount: number;
  avgScore: number;
}

interface VersionStats {
  versionId: string;
  evalCount: number;
  avgScore: number;
  gradeDistribution: Record<string, number>;
  dimensions: { legal: number; ethical: number; professional: number; ux: number };
}

interface CaseComparison {
  conversationId: string;
  v1Score: number;
  v2Score: number;
  v1Grade: string;
  v2Grade: string;
  diff: number;
  status: 'improved' | 'regressed' | 'unchanged';
}

interface CompareData {
  stats1: VersionStats;
  stats2: VersionStats;
  dimDiffs: { legal: number; ethical: number; professional: number; ux: number };
  caseComparisons: CaseComparison[];
  commonCaseCount: number;
}

/* ---------- Constants ---------- */

const DIM_LABELS: Record<string, string> = {
  legal: '法律合规',
  ethical: '伦理规范',
  professional: '专业性',
  ux: '用户体验',
};

const GRADE_COLORS: Record<string, string> = {
  EXCELLENT: '#16a34a',
  GOOD: '#2563eb',
  ACCEPTABLE: '#f97316',
  POOR: '#dc2626',
  CRITICAL: '#991b1b',
};

/* ---------- Helpers ---------- */

function formatDelta(value: number, suffix = ''): { text: string; color: string } {
  if (value === 0) return { text: `0${suffix}`, color: '#86909c' };
  const prefix = value > 0 ? '+' : '';
  return {
    text: `${prefix}${value}${suffix}`,
    color: value > 0 ? '#00b42a' : '#cb2634',
  };
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function gradeColor(grade: string): string {
  return GRADE_COLORS[grade] || '#86909c';
}

/* ---------- Component ---------- */

export default function VersionComparePage() {
  const router = useRouter();

  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [v1, setV1] = useState<string>('');
  const [v2, setV2] = useState<string>('');
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载版本列表
  useEffect(() => {
    (async () => {
      setVersionsLoading(true);
      try {
        const res = await fetch('/api/eval/prompt-versions');
        if (res.ok) {
          const json = await res.json();
          setVersions(json.versions || []);
        }
      } catch { /* ignore */ }
      finally { setVersionsLoading(false); }
    })();
  }, []);

  const doCompare = async () => {
    if (!v1 || !v2) { Message.warning('请选择两个版本'); return; }
    if (v1 === v2) { Message.warning('请选择不同的版本'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/eval/version-compare?v1=${encodeURIComponent(v1)}&v2=${encodeURIComponent(v2)}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        Message.error(err.error || '对比失败');
      }
    } catch { Message.error('对比失败'); }
    finally { setLoading(false); }
  };

  const versionOptions = versions.map(v => ({
    value: v.id,
    label: `${v.name} (${shortHash(v.hash)}) — ${v.evalCount}条评估, 均分${v.avgScore}`,
  }));

  const dimKeys = ['legal', 'ethical', 'professional', 'ux'] as const;

  // 找出维度最大差异
  const maxDimDiff = data
    ? dimKeys.reduce((max, k) => {
        const abs = Math.abs(data.dimDiffs[k]);
        return abs > Math.abs(max.value) ? { key: k, value: data.dimDiffs[k] } : max;
      }, { key: '' as string, value: 0 })
    : null;

  // case 级表格列
  const caseColumns = [
    {
      title: '对话 ID',
      dataIndex: 'conversationId',
      width: 220,
      render: (id: string) => (
        <span className="text-xs font-mono text-gray-600 truncate block" title={id}>
          {id.slice(0, 16)}...
        </span>
      ),
    },
    {
      title: '版本 A',
      dataIndex: 'v1Score',
      width: 100,
      render: (score: number, record: CaseComparison) => (
        <span className="text-sm">
          <span className="font-semibold">{score}</span>
          <Tag size="small" className="ml-1" style={{ color: gradeColor(record.v1Grade) }}>{record.v1Grade}</Tag>
        </span>
      ),
    },
    {
      title: '版本 B',
      dataIndex: 'v2Score',
      width: 100,
      render: (score: number, record: CaseComparison) => (
        <span className="text-sm">
          <span className="font-semibold">{score}</span>
          <Tag size="small" className="ml-1" style={{ color: gradeColor(record.v2Grade) }}>{record.v2Grade}</Tag>
        </span>
      ),
    },
    {
      title: '差异',
      dataIndex: 'diff',
      width: 80,
      render: (diff: number) => {
        const d = formatDelta(diff);
        return <span className="text-sm font-semibold" style={{ color: d.color }}>{d.text}</span>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: string) => {
        if (status === 'improved') return <Tag size="small" color="green">改进</Tag>;
        if (status === 'regressed') return <Tag size="small" color="red">退化</Tag>;
        return <Tag size="small" color="gray">持平</Tag>;
      },
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3">
        <Button icon={<IconArrowLeft />} size="small" onClick={() => router.push('/dashboard/optimization/prompt-versions')}>返回</Button>
        <h1 className="text-2xl font-bold text-gray-900">版本对比</h1>
      </div>

      {/* 版本选择器 */}
      <Card className="shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">版本 A</div>
            <Select
              size="small"
              placeholder="选择 Prompt 版本 A"
              value={v1 || undefined}
              onChange={setV1}
              options={versionOptions}
              loading={versionsLoading}
              showSearch
              allowClear
              style={{ width: '100%' }}
            />
          </div>
          <span className="text-lg font-bold text-gray-300 mt-4">vs</span>
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">版本 B</div>
            <Select
              size="small"
              placeholder="选择 Prompt 版本 B"
              value={v2 || undefined}
              onChange={setV2}
              options={versionOptions}
              loading={versionsLoading}
              showSearch
              allowClear
              style={{ width: '100%' }}
            />
          </div>
          <Button type="primary" size="small" onClick={doCompare} loading={loading} className="mt-4">
            对比
          </Button>
        </div>
      </Card>

      {loading && (
        <div className="flex justify-center py-12">
          <Spin size={32} />
        </div>
      )}

      {!loading && !data && (
        <Empty description="选择两个 Prompt 版本并点击对比" />
      )}

      {!loading && data && (
        <>
          {/* 汇总卡片 4 宫格 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 平均分差异 */}
            <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">平均分</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-indigo-600">{data.stats1.avgScore}</span>
                <span className="text-gray-400">&rarr;</span>
                <span className="text-lg font-bold text-purple-600">{data.stats2.avgScore}</span>
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: formatDelta(Math.round((data.stats2.avgScore - data.stats1.avgScore) * 10) / 10).color }}>
                {formatDelta(Math.round((data.stats2.avgScore - data.stats1.avgScore) * 10) / 10).text}
              </div>
            </Card>

            {/* 等级分布对比 */}
            <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">等级分布</div>
              <div className="flex flex-col gap-0.5 mt-1">
                {['EXCELLENT', 'GOOD', 'ACCEPTABLE', 'POOR', 'CRITICAL'].map(grade => {
                  const c1 = data.stats1.gradeDistribution[grade] || 0;
                  const c2 = data.stats2.gradeDistribution[grade] || 0;
                  if (c1 === 0 && c2 === 0) return null;
                  return (
                    <div key={grade} className="flex items-center gap-1 text-xs">
                      <span className="w-16 truncate" style={{ color: gradeColor(grade) }}>{grade}</span>
                      <span className="text-indigo-600 font-medium">{c1}</span>
                      <span className="text-gray-300">/</span>
                      <span className="text-purple-600 font-medium">{c2}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* 最大维度差异 */}
            <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">最大维度差异</div>
              {maxDimDiff && maxDimDiff.key ? (
                <>
                  <div className="text-sm font-medium text-gray-700 mt-1">
                    {DIM_LABELS[maxDimDiff.key] || maxDimDiff.key}
                  </div>
                  <div className="text-lg font-bold mt-0.5" style={{ color: formatDelta(maxDimDiff.value).color }}>
                    {formatDelta(maxDimDiff.value).text}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-400 mt-1">无差异</div>
              )}
            </Card>

            {/* 评估数量 */}
            <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">评估数量</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-indigo-600">{data.stats1.evalCount}</span>
                <span className="text-gray-400">/</span>
                <span className="text-lg font-bold text-purple-600">{data.stats2.evalCount}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                A / B {data.commonCaseCount > 0 && `(${data.commonCaseCount} 条共同对话)`}
              </div>
            </Card>
          </div>

          {/* 维度对比条形图 */}
          <Card className="shadow-xs" title={<span className="text-sm font-semibold">维度对比（满分 10）</span>}>
            <div className="space-y-4">
              {dimKeys.map(key => {
                const s1 = data.stats1.dimensions[key];
                const s2 = data.stats2.dimensions[key];
                const delta = formatDelta(data.dimDiffs[key]);
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 w-24 shrink-0">{DIM_LABELS[key]}</span>
                      <span className="text-sm font-semibold" style={{ color: delta.color }}>{delta.text}</span>
                    </div>
                    {/* Version A bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6 text-right shrink-0">A</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-xs overflow-hidden">
                        <div
                          className="h-full rounded-xs transition-all duration-300"
                          style={{ width: `${(s1 / 10) * 100}%`, backgroundColor: '#6366f1' }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-8 text-right shrink-0">{s1}</span>
                    </div>
                    {/* Version B bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6 text-right shrink-0">B</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-xs overflow-hidden">
                        <div
                          className="h-full rounded-xs transition-all duration-300"
                          style={{ width: `${(s2 / 10) * 100}%`, backgroundColor: '#a855f7' }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-8 text-right shrink-0">{s2}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Case 级对比表格 */}
          <Card
            className="shadow-xs"
            title={
              <span className="text-sm font-semibold">
                Case 级对比
                {data.caseComparisons.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    {data.caseComparisons.filter(c => c.status === 'regressed').length} 退化 /
                    {' '}{data.caseComparisons.filter(c => c.status === 'improved').length} 改进 /
                    {' '}{data.caseComparisons.filter(c => c.status === 'unchanged').length} 持平
                  </span>
                )}
              </span>
            }
          >
            {data.caseComparisons.length > 0 ? (
              <Table
                size="small"
                data={data.caseComparisons}
                columns={caseColumns}
                rowKey="conversationId"
                pagination={{ pageSize: 20, sizeCanChange: false }}
                rowClassName={(record) => {
                  if (record.status === 'regressed') return 'bg-red-50/50';
                  if (record.status === 'improved') return 'bg-green-50/50';
                  return '';
                }}
              />
            ) : (
              <Empty description={data.commonCaseCount === 0 ? '两个版本没有共同的对话，无法逐条对比' : '无对比数据'} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
