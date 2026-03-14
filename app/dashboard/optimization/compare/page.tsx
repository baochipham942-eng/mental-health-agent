'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Tag, Select, Tabs, Empty, Spin, Message } from '@arco-design/web-react';
import { IconArrowLeft } from '@arco-design/web-react/icon';
import { useRouter, useSearchParams } from 'next/navigation';
import { passRateHex, modeTagColor } from '@/lib/eval/constants';

const TabPane = Tabs.TabPane;

/* ---------- Types ---------- */

interface RunOption {
  runId: string;
  model: string;
  mode: string;
  status: string;
  timestamp: string;
  passRate: number;
}

interface CompareData {
  run1: { id: string; model: string; mode: string; timestamp: string };
  run2: { id: string; model: string; mode: string; timestamp: string };
  comparison: { dimension: string; run1: { pass: number; total: number; rate: number }; run2: { pass: number; total: number; rate: number }; diff: number }[];
  summary: {
    run1: { passRate: number; avgScore: number; avgTtft: number; totalCases: number };
    run2: { passRate: number; avgScore: number; avgTtft: number; totalCases: number };
    diff: { passRate: number; avgScore: number; avgTtft: number };
  };
  regressions: { caseId: string; dimension: string; run1: string; run2: string }[];
  improvements: { caseId: string; dimension: string; run1: string; run2: string }[];
}

/* ---------- Helpers ---------- */

function formatDelta(value: number, unit = '', inverse = false): { text: string; color: string } {
  if (value === 0) return { text: `0${unit}`, color: '#86909c' };
  const isPositive = inverse ? value < 0 : value > 0;
  const prefix = value > 0 ? '+' : '';
  return {
    text: `${prefix}${value}${unit}`,
    color: isPositive ? '#00b42a' : '#cb2634',
  };
}

function shortRunId(id: string): string {
  return id.replace(/^(academic|product)-/, '').replace(/^\d{4}-\d{2}-\d{2}[T_-]?\d{0,6}-?/, '').slice(0, 16) || id.slice(0, 16);
}

/* ---------- Component ---------- */

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [runs, setRuns] = useState<RunOption[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [run1, setRun1] = useState<string>(searchParams.get('run1') || '');
  const [run2, setRun2] = useState<string>(searchParams.get('run2') || '');
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载 runs 列表
  useEffect(() => {
    (async () => {
      setRunsLoading(true);
      try {
        const res = await fetch('/api/eval/runs');
        if (res.ok) {
          const json = await res.json();
          setRuns(json.runs.filter((r: any) => r.status === 'completed'));
        }
      } catch { /* ignore */ }
      finally { setRunsLoading(false); }
    })();
  }, []);

  // URL 参数自动触发对比
  useEffect(() => {
    if (run1 && run2 && run1 !== run2) {
      doCompare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsLoading]); // runs 加载完成后如果有参数就自动对比

  const doCompare = async () => {
    if (!run1 || !run2) { Message.warning('请选择两个实验'); return; }
    if (run1 === run2) { Message.warning('请选择不同的实验'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/eval/compare?run1=${encodeURIComponent(run1)}&run2=${encodeURIComponent(run2)}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        Message.error('对比失败');
      }
    } catch { Message.error('对比失败'); }
    finally { setLoading(false); }
  };

  const runOptions = runs.map(r => ({
    value: r.runId,
    label: `${shortRunId(r.runId)} (${r.mode} / ${r.model || 'deepseek'})`,
  }));

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3">
        <Button icon={<IconArrowLeft />} size="small" onClick={() => router.push('/dashboard/optimization')}>返回</Button>
        <h1 className="text-2xl font-bold text-gray-900">实验对比</h1>
      </div>

      {/* 实验选择器 */}
      <Card className="shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">实验 A</div>
            <Select
              size="small"
              placeholder="选择实验 A"
              value={run1 || undefined}
              onChange={setRun1}
              options={runOptions}
              loading={runsLoading}
              showSearch
              allowClear
              style={{ width: '100%' }}
            />
          </div>
          <span className="text-lg font-bold text-gray-300 mt-4">vs</span>
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">实验 B</div>
            <Select
              size="small"
              placeholder="选择实验 B"
              value={run2 || undefined}
              onChange={setRun2}
              options={runOptions}
              loading={runsLoading}
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
        <Empty description="选择两个实验并点击对比" />
      )}

      {!loading && data && (
        <>
          {/* 实验信息 */}
          <div className="flex gap-4 text-sm text-gray-500">
            <span>A: <Tag size="small" color="arcoblue">{data.run1.model}</Tag> <Tag size="small" color={modeTagColor(data.run1.mode)}>{data.run1.mode}</Tag></span>
            <span>B: <Tag size="small" color="purple">{data.run2.model}</Tag> <Tag size="small" color={modeTagColor(data.run2.mode)}>{data.run2.mode}</Tag></span>
          </div>

          {/* 汇总卡片 4 宫格 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 通过率差异 */}
            <Card className="shadow-sm" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">通过率</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold" style={{ color: passRateHex(data.summary.run1.passRate) }}>
                  {data.summary.run1.passRate}%
                </span>
                <span className="text-gray-400">&rarr;</span>
                <span className="text-lg font-bold" style={{ color: passRateHex(data.summary.run2.passRate) }}>
                  {data.summary.run2.passRate}%
                </span>
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: formatDelta(data.summary.diff.passRate, '%').color }}>
                {formatDelta(data.summary.diff.passRate, '%').text}
              </div>
            </Card>

            {/* 综合分差异 */}
            <Card className="shadow-sm" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">综合分</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-gray-800">
                  {data.summary.run1.avgScore || '-'}
                </span>
                <span className="text-gray-400">&rarr;</span>
                <span className="text-lg font-bold text-gray-800">
                  {data.summary.run2.avgScore || '-'}
                </span>
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: formatDelta(data.summary.diff.avgScore).color }}>
                {formatDelta(data.summary.diff.avgScore).text}
              </div>
            </Card>

            {/* TTFT 差异 */}
            <Card className="shadow-sm" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">TTFT</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-gray-800">
                  {data.summary.run1.avgTtft ? `${data.summary.run1.avgTtft}ms` : '-'}
                </span>
                <span className="text-gray-400">&rarr;</span>
                <span className="text-lg font-bold text-gray-800">
                  {data.summary.run2.avgTtft ? `${data.summary.run2.avgTtft}ms` : '-'}
                </span>
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: formatDelta(data.summary.diff.avgTtft, 'ms', true).color }}>
                {formatDelta(data.summary.diff.avgTtft, 'ms', true).text}
              </div>
            </Card>

            {/* Case 数 */}
            <Card className="shadow-sm" bodyStyle={{ padding: '12px 16px' }}>
              <div className="text-xs text-gray-500">Case 数量</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-indigo-600">
                  {data.summary.run1.totalCases}
                </span>
                <span className="text-gray-400">/</span>
                <span className="text-lg font-bold text-purple-600">
                  {data.summary.run2.totalCases}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">A / B</div>
            </Card>
          </div>

          {/* 维度对比条形图 */}
          <Card className="shadow-sm" title={<span className="text-sm font-semibold">维度对比</span>}>
            <div className="space-y-4">
              {data.comparison.map(item => {
                const maxRate = Math.max(item.run1.rate, item.run2.rate, 1);
                const delta = formatDelta(item.diff, '%');
                return (
                  <div key={item.dimension} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 w-44 shrink-0">{item.dimension}</span>
                      <span className="text-sm font-semibold" style={{ color: delta.color }}>{delta.text}</span>
                    </div>
                    {/* Run1 bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6 text-right shrink-0">A</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-sm overflow-hidden relative">
                        <div
                          className="h-full rounded-sm transition-all duration-300"
                          style={{
                            width: `${(item.run1.rate / 100) * 100}%`,
                            backgroundColor: '#3b82f6',
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-12 text-right shrink-0">{item.run1.rate}%</span>
                    </div>
                    {/* Run2 bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-6 text-right shrink-0">B</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-sm overflow-hidden relative">
                        <div
                          className="h-full rounded-sm transition-all duration-300"
                          style={{
                            width: `${(item.run2.rate / 100) * 100}%`,
                            backgroundColor: '#f97316',
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-12 text-right shrink-0">{item.run2.rate}%</span>
                    </div>
                  </div>
                );
              })}
              {data.comparison.length === 0 && (
                <Empty description="无维度数据" />
              )}
            </div>
          </Card>

          {/* 退化/改进列表 */}
          <Card className="shadow-sm">
            <Tabs defaultActiveTab="regressions">
              <TabPane key="regressions" title={
                <span>退化 {data.regressions.length > 0 && <Tag size="small" color="red">{data.regressions.length}</Tag>}</span>
              }>
                {data.regressions.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {data.regressions.map((item, idx) => (
                      <div
                        key={idx}
                        className="border border-red-200 rounded-lg p-3 cursor-pointer hover:bg-red-50 transition-colors"
                        onClick={() => router.push(`/dashboard/optimization/exp/${encodeURIComponent(run1)}?case=${encodeURIComponent(item.caseId)}`)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-gray-700 truncate" title={item.caseId}>
                            {item.caseId}
                          </span>
                          <Tag size="small" color="red">Pass &rarr; Fail</Tag>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{item.dimension}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="无退化项" className="py-6" />
                )}
              </TabPane>
              <TabPane key="improvements" title={
                <span>改进 {data.improvements.length > 0 && <Tag size="small" color="green">{data.improvements.length}</Tag>}</span>
              }>
                {data.improvements.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {data.improvements.map((item, idx) => (
                      <div
                        key={idx}
                        className="border border-green-200 rounded-lg p-3 cursor-pointer hover:bg-green-50 transition-colors"
                        onClick={() => router.push(`/dashboard/optimization/exp/${encodeURIComponent(run2)}?case=${encodeURIComponent(item.caseId)}`)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-gray-700 truncate" title={item.caseId}>
                            {item.caseId}
                          </span>
                          <Tag size="small" color="green">Fail &rarr; Pass</Tag>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{item.dimension}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="无改进项" className="py-6" />
                )}
              </TabPane>
            </Tabs>
          </Card>
        </>
      )}
    </div>
  );
}
