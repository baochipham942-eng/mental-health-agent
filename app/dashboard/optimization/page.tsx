'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Button, Tag, Table, Empty, Message, Modal, Checkbox, InputNumber, Input, Spin, Select, Progress } from '@arco-design/web-react';
import { IconLoading, IconPlus, IconSearch } from '@arco-design/web-react/icon';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import { useRouter } from 'next/navigation';

/* ---------- Types ---------- */

interface EvalRun {
  runId: string;
  dataset: string;
  model: string;
  mode: string;
  version: string;
  gitCommit: string;
  status: string;
  timestamp: string;
  totalCases: number;
  totalTurns: number;
  avgTtftMs: number;
  passRate: number;
  failCount: number;
  driftCount?: number;
  annotationStats: { total: number; annotated: number; pass: number; fail: number; pending: number };
  progress: { completed: number; total: number };
  sparklineData?: number[];
}

interface DatasetInfo { id: string; name: string; total_cases: number; caseCount: number }
interface CaseItem { id: string; dataset_id: string; category: string | null; situation: string | null; turn_count: number; first_prompt?: string | null }

import { passRateHex, statusTagColor, modeTagColor } from '@/lib/eval/constants';

/* ---------- Sparkline ---------- */

function Sparkline({ data, width = 80, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 3) return <span className="text-gray-400 text-xs">&mdash;</span>;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 2) - 1}`
  ).join(' ');
  const lastY = height - (data[data.length - 1] / max) * (height - 2) - 1;
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke="#867AFE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r="2" fill="#867AFE" />
    </svg>
  );
}

/* ---------- Helpers ---------- */

/* ---------- Model Catalog ---------- */
// 数据来源: ~/Downloads/ai/model-catalog.json（中央模型目录）
// 更新模型后运行 ~/Downloads/ai/sync-models.sh 同步
import catalogData from '@/lib/model-catalog.json';

const DASHBOARD_PROVIDERS = ['deepseek', 'moonshot', 'openai', 'openrouter'];
const PROVIDER_LABEL_MAP: Record<string, string> = { moonshot: 'Kimi' };

const MODEL_CATALOG: Record<string, { label: string; models: { value: string; label: string; desc: string }[] }> =
  Object.fromEntries(
    catalogData.providers
      .filter((p) => DASHBOARD_PROVIDERS.includes(p.id))
      .map((p) => [
        p.id,
        {
          label: PROVIDER_LABEL_MAP[p.id] || p.name,
          models: p.models.map((m) => ({
            value: m.id,
            label: m.label.replace(/ \(.*?\)$/, ''),
            desc: m.desc,
          })),
        },
      ])
  );

/* ---------- Component ---------- */

export default function ExperimentsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [modeFilter, setModeFilter] = useState<string>('all');

  // 新建实验
  const [modalVisible, setModalVisible] = useState(false);
  const [experimentMode, setExperimentMode] = useState<'benchmark' | 'product'>('benchmark');
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [skipJudge, setSkipJudge] = useState(false);
  const [limitPerCase, setLimitPerCase] = useState(20);
  const [evalProvider, setEvalProvider] = useState('deepseek');
  const [evalModel, setEvalModel] = useState('deepseek-chat');
  // Product 模式
  const [prodConversations, setProdConversations] = useState<Array<{ id: string; title: string; type: string; labType?: string; messageCount: number; firstPrompt: string; createdAt: string }>>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [selectedConvIds, setSelectedConvIds] = useState<string[]>([]);
  const [selectedLabIds, setSelectedLabIds] = useState<string[]>([]);

  // 运行状态
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 对比功能
  const [compareVisible, setCompareVisible] = useState(false);
  const [compareRun1, setCompareRun1] = useState<string>('');
  const [compareRun2, setCompareRun2] = useState<string>('');

  useEffect(() => { loadRuns(); }, []);
  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/eval/runs');
      if (res.ok) setRuns((await res.json()).runs);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  // 按 dataset+model 分组，计算同组最近 10 次 passRate 作为 sparkline 数据
  const runsWithSparkline = useMemo(() => {
    const groupMap: Record<string, number[]> = {};
    const sorted = [...runs].reverse();
    for (const r of sorted) {
      const key = `${r.dataset}|${r.model}`;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(r.passRate);
    }
    for (const key of Object.keys(groupMap)) {
      if (groupMap[key].length > 10) {
        groupMap[key] = groupMap[key].slice(-10);
      }
    }
    return runs.map(r => ({
      ...r,
      sparklineData: groupMap[`${r.dataset}|${r.model}`] || [],
    }));
  }, [runs]);

  const handleProviderChange = (provider: string) => {
    setEvalProvider(provider);
    setEvalModel(MODEL_CATALOG[provider]?.models[0]?.value || '');
  };

  const openModal = async () => {
    setModalVisible(true);
    setSelectedCases([]);
    setSelectedDataset(null);
    setCases([]);
    setSelectedConvIds([]);
    setSelectedLabIds([]);
    try {
      const res = await fetch('/api/eval/datasets');
      if (res.ok) setDatasets((await res.json()).datasets);
    } catch { /* ignore */ }
  };

  const loadProductConversations = async () => {
    setProdLoading(true);
    try {
      const res = await fetch('/api/eval/conversations?type=all&limit=100');
      if (res.ok) setProdConversations((await res.json()).conversations);
    } catch { /* ignore */ }
    finally { setProdLoading(false); }
  };

  const handleModeSwitch = (mode: 'benchmark' | 'product') => {
    setExperimentMode(mode);
    if (mode === 'product' && prodConversations.length === 0) {
      loadProductConversations();
    }
  };

  const startProductExperiment = async () => {
    if (selectedConvIds.length === 0 && selectedLabIds.length === 0) {
      Message.warning('请至少选择一条会话');
      return;
    }
    setModalVisible(false);
    setRunning(true);
    setRunOutput('启动 Product 评测...\n');

    try {
      const res = await fetch('/api/eval/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'product',
          conversationIds: selectedConvIds,
          labSessionIds: selectedLabIds,
          skipJudge,
          provider: evalProvider,
          model: evalModel,
        }),
      });
      const { runId } = await res.json();

      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/eval/status/${runId}`);
          if (sr.ok) {
            const data = await sr.json();
            setRunOutput(data.output || '');
            if (data.status !== 'running') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setRunning(false);
              if (data.status === 'completed') { Message.success('Product 评测完成！'); loadRuns(); }
              else Message.error('评测失败');
            }
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch {
      setRunning(false);
      Message.error('启动失败');
    }
  };

  const selectDataset = async (dsId: string) => {
    setSelectedDataset(dsId);
    setCasesLoading(true);
    try {
      const url = searchQuery
        ? `/api/eval/datasets?dataset=${dsId}&q=${encodeURIComponent(searchQuery)}`
        : `/api/eval/datasets?dataset=${dsId}&pageSize=200`;
      const res = await fetch(url);
      if (res.ok) setCases((await res.json()).cases || []);
    } catch { /* ignore */ }
    finally { setCasesLoading(false); }
  };

  const selectAll = () => { setSelectedCases(prev => [...new Set([...prev, ...cases.map(c => c.id)])]); };
  const deselectAll = () => { const ids = new Set(cases.map(c => c.id)); setSelectedCases(prev => prev.filter(id => !ids.has(id))); };

  const startExperiment = async () => {
    if (selectedCases.length === 0) { Message.warning('请至少选择一个用例'); return; }
    setModalVisible(false);
    setRunning(true);
    setRunOutput('启动评测...\n');

    const byDataset: Record<string, string[]> = {};
    for (const caseId of selectedCases) {
      const ds = caseId.split(':')[0];
      if (!byDataset[ds]) byDataset[ds] = [];
      byDataset[ds].push(caseId);
    }

    try {
      const res = await fetch('/api/eval/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasets: Object.keys(byDataset),
          caseIds: selectedCases,
          limit: limitPerCase,
          skipJudge,
          provider: evalProvider,
          model: evalModel,
        }),
      });
      const { runId } = await res.json();

      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/eval/status/${runId}`);
          if (sr.ok) {
            const data = await sr.json();
            setRunOutput(data.output || '');
            if (data.status !== 'running') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setRunning(false);
              if (data.status === 'completed') { Message.success('评测完成！'); loadRuns(); }
              else Message.error('评测失败');
            }
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch {
      setRunning(false);
      Message.error('启动失败');
    }
  };

  const doCompare = async () => {
    if (!compareRun1 || !compareRun2) { Message.warning('请选择两个实验'); return; }
    if (compareRun1 === compareRun2) { Message.warning('请选择不同的实验'); return; }
    setCompareVisible(false);
    router.push(`/dashboard/optimization/compare?run1=${encodeURIComponent(compareRun1)}&run2=${encodeURIComponent(compareRun2)}`);
  };

  // 筛选（使用带 sparkline 数据的 runs）
  const filteredRuns = modeFilter === 'all' ? runsWithSparkline : runsWithSparkline.filter(r => r.mode === modeFilter);

  // 统计
  const totalRuns = runs.length;
  const runningCount = runs.filter(r => r.status === 'running').length;
  const completedCount = runs.filter(r => r.status === 'completed').length;
  const latestPassRate = runs.find(r => r.status === 'completed')?.passRate ?? 0;

  const columns: ColumnProps<EvalRun>[] = [
    {
      title: 'ID', dataIndex: 'runId', width: 160,
      render: (v: string) => {
        // 去掉前缀和日期部分，只保留有意义的标识
        const short = v.replace(/^(academic|product)-/, '').replace(/^\d{4}-\d{2}-\d{2}[T_-]?\d{0,6}-?/, '').slice(0, 16) || v.slice(0, 16);
        return (
          <a onClick={() => router.push(`/dashboard/optimization/exp/${encodeURIComponent(v)}`)}
            className="text-indigo-600 hover:underline cursor-pointer font-mono text-xs" title={v}>
            {short}
          </a>
        );
      },
    },
    {
      title: '模式', dataIndex: 'mode', width: 90,
      render: (v: string) => <Tag color={modeTagColor(v)} size="small">{v}</Tag>,
    },
    {
      title: '模型', dataIndex: 'model', width: 140,
      render: (v: string) => {
        const display = v || 'deepseek';
        const color = display.startsWith('deepseek') ? 'green' : display.startsWith('kimi') ? 'purple' : display.startsWith('gpt') ? 'orange' : 'blue';
        return <Tag color={color} size="small">{display}</Tag>;
      },
    },
    { title: '数据集', dataIndex: 'dataset', width: 130, render: (v: string) => <span className="text-xs text-gray-600">{v}</span> },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={statusTagColor(v)} size="small">{v}</Tag>,
    },
    {
      title: '进度', width: 120,
      render: (_: unknown, record: EvalRun) => {
        const p = record.progress;
        const pct = p.total > 0 ? Math.round(p.completed / p.total * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <Progress percent={pct} size="small" style={{ width: 60 }} showText={false}
              color={record.status === 'completed' ? '#00b42a' : '#f77234'} />
            <span className="text-xs text-gray-500">{p.completed}/{p.total}</span>
          </div>
        );
      },
    },
    {
      title: '通过率', dataIndex: 'passRate', width: 80, align: 'center' as const,
      render: (v: number) => v > 0 ? <span style={{ color: passRateHex(v), fontWeight: 600 }}>{v}%</span> : <span className="text-gray-400">-</span>,
      sorter: (a: EvalRun, b: EvalRun) => a.passRate - b.passRate,
    },
    {
      title: '趋势', dataIndex: 'sparklineData', width: 100, align: 'center' as const,
      render: (v: number[]) => <Sparkline data={v || []} />,
    },
    {
      title: '创建时间', dataIndex: 'timestamp', width: 155,
      render: (v: string) => v ? <span className="text-xs text-gray-500">{v}</span> : '-',
    },
    {
      title: '操作', width: 60,
      render: (_: unknown, record: EvalRun) => (
        <Button type="text" size="mini" status="danger"
          onClick={async (e) => {
            e.stopPropagation();
            Modal.confirm({
              title: '确认删除',
              content: `确定要删除实验 ${record.runId.slice(0, 20)} 吗？此操作不可逆。`,
              onOk: async () => {
                try {
                  const res = await fetch(`/api/eval/runs/${encodeURIComponent(record.runId)}`, { method: 'DELETE' });
                  if (res.ok) { Message.success('已删除'); loadRuns(); }
                  else Message.error('删除失败');
                } catch { Message.error('删除失败'); }
              },
            });
          }}>
          删除
        </Button>
      ),
    },
  ];

  const selectedSummary = () => {
    const byDs: Record<string, number> = {};
    for (const id of selectedCases) { const ds = id.split(':')[0]; byDs[ds] = (byDs[ds] || 0) + 1; }
    return Object.entries(byDs).map(([ds, n]) => `${ds} ${n}条`).join(', ');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* 运行状态 */}
      {(running || runOutput) && (
        <Card className="shadow-sm" title={
          <span className="font-semibold text-sm flex items-center gap-2">
            {running && <IconLoading className="animate-spin" />}
            {running ? '评测运行中...' : '最近运行输出'}
          </span>
        }>
          <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs max-h-48 overflow-y-auto whitespace-pre-wrap">
            {runOutput}
          </div>
        </Card>
      )}

      {/* 标题 + 筛选 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">实验列表</h1>
          <p className="text-sm text-gray-500">跨基准和产品模式的评测运行记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="small" onClick={() => setCompareVisible(true)} disabled={runs.filter(r => r.status === 'completed').length < 2}>对比</Button>
          <Button type="primary" icon={<IconPlus />} size="small" onClick={openModal} disabled={running}>
            新建实验
          </Button>
        </div>
      </div>

      {/* 模式筛选 */}
      <div className="flex items-center gap-2">
        {['all', 'benchmark', 'product'].map(mode => (
          <Button key={mode} size="small" type={modeFilter === mode ? 'primary' : 'secondary'}
            onClick={() => setModeFilter(mode)}>
            {mode === 'all' ? '全部' : mode === 'benchmark' ? '基准模式' : '产品模式'}
          </Button>
        ))}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '实验总数', value: totalRuns, color: '#165dff' },
          { label: '运行中', value: runningCount, color: '#f77234' },
          { label: '已完成', value: completedCount, color: '#00b42a' },
          { label: '最新通过率', value: latestPassRate > 0 ? `${latestPassRate}%` : '-', color: passRateHex(latestPassRate) },
        ].map(item => (
          <Card key={item.label} className="shadow-sm" bodyStyle={{ padding: '12px 16px' }}>
            <div className="text-xs text-gray-500">{item.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: item.color }}>{item.value}</div>
          </Card>
        ))}
      </div>

      {/* 实验表格 */}
      <Card className="shadow-sm">
        <Table
          columns={columns}
          data={filteredRuns}
          rowKey="runId"
          loading={loading}
          pagination={filteredRuns.length > 20 ? { pageSize: 20 } : false}
          size="small"
          noDataElement={<Empty description="暂无实验，点击「新建实验」开始" />}
          onRow={(record) => ({
            className: 'cursor-pointer hover:bg-gray-50',
            onClick: () => router.push(`/dashboard/optimization/exp/${encodeURIComponent(record.runId)}`),
          })}
        />
      </Card>

      {/* ===== 对比弹窗（仅选择实验，确认后跳转对比页） ===== */}
      <Modal
        title="选择对比实验"
        visible={compareVisible}
        onCancel={() => setCompareVisible(false)}
        onOk={doCompare}
        okText="开始对比"
        cancelText="取消"
        style={{ width: 560, maxWidth: '95vw' }}
      >
        <div className="flex items-center gap-3">
          <Select size="small" placeholder="选择实验 A" value={compareRun1 || undefined} onChange={setCompareRun1} style={{ flex: 1 }}
            options={runs.filter(r => r.status === 'completed').map(r => ({ value: r.runId, label: `${r.runId.slice(0, 20)} (${r.mode})` }))} />
          <span className="text-gray-400 font-bold">vs</span>
          <Select size="small" placeholder="选择实验 B" value={compareRun2 || undefined} onChange={setCompareRun2} style={{ flex: 1 }}
            options={runs.filter(r => r.status === 'completed').map(r => ({ value: r.runId, label: `${r.runId.slice(0, 20)} (${r.mode})` }))} />
        </div>
      </Modal>

      {/* ===== 新建实验弹窗 ===== */}
      <Modal
        title="新建实验"
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        maskClosable={false}
        style={{ width: 960, maxWidth: '95vw' }}
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-gray-500">
              {experimentMode === 'benchmark' ? (
                <>
                  已选 <b className="text-indigo-600">{selectedCases.length}</b> 条用例
                  {selectedCases.length > 0 && <span className="ml-2 text-gray-400">({selectedSummary()})</span>}
                  {evalModel && <Tag color="arcoblue" size="small" className="ml-2">{evalModel}</Tag>}
                </>
              ) : (
                <>
                  已选 <b className="text-purple-600">{selectedConvIds.length + selectedLabIds.length}</b> 条会话
                  {selectedConvIds.length > 0 && <span className="ml-2 text-gray-400">({selectedConvIds.length} 普通)</span>}
                  {selectedLabIds.length > 0 && <span className="ml-1 text-gray-400">({selectedLabIds.length} 实验室)</span>}
                </>
              )}
            </div>
            <Button type="primary"
              onClick={experimentMode === 'benchmark' ? startExperiment : startProductExperiment}
              disabled={experimentMode === 'benchmark' ? selectedCases.length === 0 : (selectedConvIds.length + selectedLabIds.length === 0)}>
              开始评测
            </Button>
          </div>
        }
      >
        {/* 模式 Tab */}
        <div className="flex gap-2 mb-4">
          <Button size="small" type={experimentMode === 'benchmark' ? 'primary' : 'secondary'}
            onClick={() => handleModeSwitch('benchmark')}>
            基准评测
          </Button>
          <Button size="small" type={experimentMode === 'product' ? 'primary' : 'secondary'}
            onClick={() => handleModeSwitch('product')}>
            产品评测（已有会话）
          </Button>
        </div>

        {experimentMode === 'benchmark' ? (
          /* ===== Benchmark 模式 ===== */
          <div className="flex flex-col min-h-[400px] overflow-hidden">
            {/* 数据集选择 — 横排 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-400 font-medium shrink-0">数据集</span>
              {datasets.map(ds => (
                <button key={ds.id} onClick={() => selectDataset(ds.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedDataset === ds.id ? 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-200' : 'text-gray-600 hover:bg-gray-50 border border-gray-100'
                  }`}>
                  {ds.name || ds.id} <span className="text-xs text-gray-400 ml-1">{ds.caseCount || ds.total_cases}</span>
                </button>
              ))}
            </div>

            {/* 用例列表 */}
            <div className="flex-1 min-h-0">
              {selectedDataset ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <Input size="small" placeholder="搜索用例..." prefix={<IconSearch />}
                      value={searchQuery} onChange={v => setSearchQuery(v)}
                      onPressEnter={() => selectDataset(selectedDataset)} style={{ flex: 1 }} />
                    <Button size="small" onClick={selectAll}>全选</Button>
                    <Button size="small" onClick={deselectAll}>取消全选</Button>
                  </div>
                  <Spin loading={casesLoading} style={{ width: '100%', overflow: 'hidden' }}>
                    <div className="max-h-[40vh] overflow-y-auto overflow-x-hidden space-y-1">
                      {cases.map(c => {
                        // 去掉 ID 中的数据集前缀（如 "esconv:1105" → "1105"）
                        const shortId = c.id.includes(':') ? c.id.split(':').pop() : c.id;
                        return (
                          <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm transition-colors w-full ${
                            selectedCases.includes(c.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'
                          }`}>
                            <Checkbox checked={selectedCases.includes(c.id)}
                              onChange={checked => setSelectedCases(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />
                            <span className="font-mono text-xs text-gray-500 shrink-0 max-w-[120px] truncate" title={c.id}>{shortId}</span>
                            <span className="text-gray-700 truncate min-w-0 flex-1" title={c.first_prompt || c.category || c.situation || ''}>
                              {c.first_prompt || c.category || c.situation || '—'}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">{c.turn_count} 轮</span>
                          </label>
                        );
                      })}
                      {cases.length === 0 && !casesLoading && <div className="text-center text-gray-400 py-8">暂无用例</div>}
                    </div>
                  </Spin>

                  {/* 评测配置 */}
                  <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
                    <div className="text-xs text-gray-400 font-medium">评测配置</div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">模型</span>
                        <Select size="small" value={evalProvider} onChange={handleProviderChange} style={{ width: 120 }}
                          options={Object.entries(MODEL_CATALOG).map(([k, v]) => ({ value: k, label: v.label }))} />
                        <Select size="small" value={evalModel} onChange={setEvalModel} style={{ width: 260 }}>
                          {(MODEL_CATALOG[evalProvider]?.models || []).map(m => (
                            <Select.Option key={m.value} value={m.value}>
                              <div className="flex items-center justify-between gap-2">
                                <span>{m.label}</span>
                                <span className="text-xs text-gray-400">{m.desc}</span>
                              </div>
                            </Select.Option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">采样条数</span>
                        <InputNumber min={1} max={200} value={limitPerCase} onChange={v => setLimitPerCase(v || 20)} style={{ width: 60 }} size="small" />
                      </div>
                      <Checkbox checked={skipJudge} onChange={setSkipJudge}>
                        <span className="text-gray-500 text-sm">仅跑代码规则</span>
                      </Checkbox>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">← 选择一个数据集</div>
              )}
            </div>
          </div>
        ) : (
          /* ===== Product 模式 ===== */
          <div className="min-h-[400px]">
            <p className="text-sm text-gray-500 mb-3">选择已有的真实对话进行质量评测</p>

            <Spin loading={prodLoading} style={{ width: '100%' }}>
              <div className="max-h-[40vh] overflow-y-auto space-y-1">
                {prodConversations.map(conv => {
                  const isConv = conv.type === 'conversation';
                  const isSelected = isConv ? selectedConvIds.includes(conv.id) : selectedLabIds.includes(conv.id);
                  const toggle = (checked: boolean) => {
                    if (isConv) {
                      setSelectedConvIds(prev => checked ? [...prev, conv.id] : prev.filter(id => id !== conv.id));
                    } else {
                      setSelectedLabIds(prev => checked ? [...prev, conv.id] : prev.filter(id => id !== conv.id));
                    }
                  };
                  return (
                    <label key={conv.id} className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-sm transition-colors ${
                      isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'
                    }`}>
                      <Checkbox checked={isSelected} onChange={toggle} />
                      <Tag size="small" color={isConv ? 'arcoblue' : 'purple'}>
                        {isConv ? '聊天' : conv.labType === 'group' ? '圆桌' : conv.labType === 'wisdom' ? '智慧' : '实验'}
                      </Tag>
                      <span className="text-gray-700 truncate flex-1" title={conv.title}>{conv.title}</span>
                      <span className="text-xs text-gray-400 shrink-0">{conv.messageCount} 条</span>
                      <span className="text-xs text-gray-400 shrink-0">{new Date(conv.createdAt).toLocaleDateString('zh-CN')}</span>
                    </label>
                  );
                })}
                {prodConversations.length === 0 && !prodLoading && (
                  <div className="text-center text-gray-400 py-8">暂无会话记录</div>
                )}
              </div>
            </Spin>

            {/* 评测配置 */}
            <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
              <div className="text-xs text-gray-400 font-medium">评测配置</div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">打分模型</span>
                  <Select size="small" value={evalProvider} onChange={handleProviderChange} style={{ width: 120 }}
                    options={Object.entries(MODEL_CATALOG).map(([k, v]) => ({ value: k, label: v.label }))} />
                  <Select size="small" value={evalModel} onChange={setEvalModel} style={{ width: 260 }}>
                    {(MODEL_CATALOG[evalProvider]?.models || []).map(m => (
                      <Select.Option key={m.value} value={m.value}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{m.label}</span>
                          <span className="text-xs text-gray-400">{m.desc}</span>
                        </div>
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                <Checkbox checked={skipJudge} onChange={setSkipJudge}>
                  <span className="text-gray-500 text-sm">仅跑代码规则（跳过 LLM Judge）</span>
                </Checkbox>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
