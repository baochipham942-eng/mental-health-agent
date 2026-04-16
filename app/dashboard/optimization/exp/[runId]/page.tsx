'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Table, Spin, Empty, Button, Tabs, Message, Input, Modal, Progress } from '@arco-design/web-react';
import { IconLeft, IconRight } from '@arco-design/web-react/icon';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import { useParams, useSearchParams } from 'next/navigation';

const TabPane = Tabs.TabPane;

/* ---------- Types ---------- */

interface RunMeta {
  runId: string;
  dataset: string;
  model: string;
  mode: string;
  status: string;
  timestamp: string;
  totalCases: number;
  passRate: number;
  failCount: number;
  driftCount?: number;
  annotationStats: { total: number; annotated: number; pass: number; fail: number; pending: number };
}

interface CaseSummary {
  case_id: string;
  category: string | null;
  emotion_type: string | null;
  situation: string | null;
  dataset_turns: number;
  eval_turns: number;
  avg_ttft: number;
  total_ms: number;
  human_status: string | null;
  human_note: string | null;
  human_tags: string | null;
  weighted_score: number | null;
}

interface TurnResult {
  turn_index: number;
  user_input: string;
  ai_reply: string;
  reference_reply: string | null;
  reference_strategy: string | null;
  route_type: string | null;
  safety_label: string | null;
  ttft_ms: number;
  total_ms: number;
  judge_results_json: string | null;
  code_checks_json: string | null;
  human_status: string | null;
  human_tags: string | null;
  human_note: string | null;
  agent_trace_json: string | null;
}

interface AgentTraceStep {
  agent: string;
  startMs: number;
  durationMs: number;
  model?: string;
  skipped?: boolean;
  result?: string;
}

interface CaseDetail {
  caseId: string;
  results: TurnResult[];
  navigation: { prev: string | null; next: string | null; current: number; total: number };
}

import { DIM_LABELS, passRateHex, humanStatusLabel, normalizeJudgeResult, judgeResultColor } from '@/lib/eval/constants';
import { computeTextDiff, type DiffSegment } from '@/lib/eval/text-diff';

function humanStatusTag(s: string | null) {
  const { text, color } = humanStatusLabel(s);
  return color ? <Tag color={color} size="small">{text}</Tag> : <Tag size="small">{text}</Tag>;
}

/* ---------- DiffView ---------- */

function DiffView({ reference, actual }: { reference: string; actual: string }) {
  const segments = computeTextDiff(reference, actual);
  return (
    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => (
        <span
          key={i}
          className={
            seg.type === 'removed' ? 'bg-red-100 text-red-800 line-through' :
            seg.type === 'added' ? 'bg-green-100 text-green-800' :
            ''
          }
        >
          {seg.value}
        </span>
      ))}
    </div>
  );
}

/* ---------- Agent Timeline ---------- */

function AgentTimeline({ trace }: { trace: AgentTraceStep[] }) {
  if (!trace || trace.length === 0) return null;
  const maxMs = Math.max(...trace.map(s => s.startMs + s.durationMs));

  const agentColors: Record<string, string> = {
    prefetch: 'bg-gray-50 text-gray-600',
    triage: 'bg-blue-50 text-blue-700',
    safety: 'bg-orange-50 text-orange-700',
    counselor: 'bg-purple-50 text-purple-700',
    quality: 'bg-green-50 text-green-700',
  };

  return (
    <div className="flex items-center gap-1 mb-2 text-xs">
      {trace.map((step, i) => (
        <span key={i} className="contents">
          {i > 0 && <span className="text-gray-400">&rarr;</span>}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${
              step.skipped ? 'bg-gray-100 text-gray-400 line-through' :
              agentColors[step.agent] || 'bg-gray-50 text-gray-600'
            }`}
            title={[step.result, step.model].filter(Boolean).join(' | ')}
          >
            {step.agent}
            <span className="font-mono text-[10px] opacity-70">{step.durationMs}ms</span>
          </span>
        </span>
      ))}
      {maxMs > 0 && (
        <span className="ml-auto text-gray-400 font-mono text-[10px]">
          total {maxMs}ms
        </span>
      )}
    </div>
  );
}

/* ---------- Component ---------- */

export default function ExperimentDetailPage() {
  const params = useParams();

  const searchParams = useSearchParams();
  const runId = decodeURIComponent(params.runId as string);

  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // 用例详情
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseModalVisible, setCaseModalVisible] = useState(false);

  // 标注表单
  const [annotStatus, setAnnotStatus] = useState<string>('');
  const [annotTags, setAnnotTags] = useState('');
  const [annotNote, setAnnotNote] = useState('');
  const [annotSaving, setAnnotSaving] = useState(false);

  // AI 分析（实验级）
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [analysisProvider, setAnalysisProvider] = useState<string>('deepseek');

  // AI 分析（用例级）
  const [caseAnalysisData, setCaseAnalysisData] = useState<any>(null);
  const [caseAnalysisLoading, setCaseAnalysisLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [runId]);

  // URL ?openCase=xxx 自动打开用例弹窗
  useEffect(() => {
    const openCaseId = searchParams.get('openCase');
    if (openCaseId && !loading) {
      openCase(openCaseId);
    }
  }, [loading, searchParams]);

  // 键盘快捷键 J/K 切换用例
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!caseModalVisible || !selectedCase) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'j' || e.key === 'J') navigateCase('next');
      if (e.key === 'k' || e.key === 'K') navigateCase('prev');
      if (e.key === 'p' || e.key === 'P') saveAnnotation('pass');
      if (e.key === 'f' || e.key === 'F') saveAnnotation('fail');
      if (e.key === 'd' || e.key === 'D') saveAnnotation('pending');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [caseModalVisible, selectedCase]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [runsRes, casesRes] = await Promise.all([
        fetch('/api/eval/runs'),
        fetch(`/api/eval/runs/${encodeURIComponent(runId)}/cases`),
      ]);

      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const run = runsData.runs?.find((r: any) => r.runId === runId);
        if (run) setRunMeta(run);
      }

      if (casesRes.ok) {
        const casesData = await casesRes.json();
        setCases(casesData.cases || []);
      }
    } catch { Message.error('加载失败'); }
    finally { setLoading(false); }
  };

  const runCaseAiAnalysis = async (targetCaseId: string) => {
    setCaseAnalysisLoading(true);
    try {
      const res = await fetch('/api/eval/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, caseId: targetCaseId, provider: analysisProvider }),
      });
      if (res.ok) {
        const data = await res.json();
        setCaseAnalysisData(data);
        if ((data.suggestions || []).length > 0) Message.success(`生成 ${data.suggestions.length} 条建议`);
      } else {
        const err = await res.json();
        Message.error(err.error || 'AI 分析失败');
      }
    } catch { Message.error('请求失败'); }
    finally { setCaseAnalysisLoading(false); }
  };

  const openCase = async (caseId: string) => {
    setCaseModalVisible(true);
    setCaseLoading(true);
    setAnnotStatus('');
    setAnnotTags('');
    setAnnotNote('');
    setCaseAnalysisData(null);

    try {
      const res = await fetch(`/api/eval/runs/${encodeURIComponent(runId)}/cases?caseId=${encodeURIComponent(caseId)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedCase(data);
        // 预填标注
        if (data.results?.[0]) {
          setAnnotStatus(data.results[0].human_status || '');
          setAnnotTags(data.results[0].human_tags ? JSON.parse(data.results[0].human_tags).join(', ') : '');
          setAnnotNote(data.results[0].human_note || '');
        }
      }
    } catch { Message.error('加载用例失败'); }
    finally { setCaseLoading(false); }
  };

  const navigateCase = useCallback((dir: 'prev' | 'next') => {
    if (!selectedCase?.navigation) return;
    const target = dir === 'prev' ? selectedCase.navigation.prev : selectedCase.navigation.next;
    if (target) openCase(target);
  }, [selectedCase]);

  const saveAnnotation = async (status?: string) => {
    if (!selectedCase) return;
    const finalStatus = status || annotStatus;
    if (!finalStatus) { Message.warning('请选择标注状态'); return; }

    setAnnotSaving(true);
    setAnnotStatus(finalStatus);
    try {
      const res = await fetch('/api/eval/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          caseId: selectedCase.caseId,
          humanStatus: finalStatus,
          humanTags: annotTags.split(',').map(t => t.trim()).filter(Boolean),
          humanNote: annotNote,
        }),
      });
      if (res.ok) {
        Message.success('标注已保存');
        // 更新本地列表
        setCases(prev => prev.map(c =>
          c.case_id === selectedCase.caseId ? { ...c, human_status: finalStatus } : c
        ));
        // 同步更新弹窗内数据
        setSelectedCase(prev => prev ? {
          ...prev,
          results: prev.results.map(r => ({ ...r, human_status: finalStatus })),
        } : prev);
      }
    } catch { Message.error('保存失败'); }
    finally { setAnnotSaving(false); }
  };

  const runAiAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisExpanded(true);
    try {
      const res = await fetch('/api/eval/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, provider: analysisProvider }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysisData(data);
        if ((data.suggestions || []).length > 0) Message.success(`生成 ${data.suggestions.length} 条改进建议`);
      } else {
        const err = await res.json();
        Message.error(err.error || 'AI 分析失败');
      }
    } catch { Message.error('请求失败'); }
    finally { setAnalysisLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spin size={32} /></div>;

  const annotated = cases.filter(c => c.human_status).length;
  const passCount = cases.filter(c => c.human_status === 'pass').length;
  const failCount = cases.filter(c => c.human_status === 'fail').length;

  // 性能统计
  const totalTurns = cases.reduce((s, c) => s + (c.eval_turns || 0), 0);
  const totalTimeMs = cases.reduce((s, c) => s + (c.total_ms || 0), 0);
  const avgTtft = totalTurns > 0
    ? Math.round(cases.reduce((s, c) => s + (c.avg_ttft || 0) * (c.eval_turns || 0), 0) / totalTurns)
    : 0;

  // 按分类聚合
  const categoryStats: Record<string, { total: number; pass: number }> = {};
  for (const c of cases) {
    const cat = c.category || '未分类';
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, pass: 0 };
    categoryStats[cat].total++;
    if (c.human_status === 'pass') categoryStats[cat].pass++;
  }

  const caseColumns: ColumnProps<CaseSummary>[] = [
    {
      title: 'ID', dataIndex: 'case_id', width: 80,
      render: (v: string) => {
        const shortId = v.includes(':') ? v.split(':').pop() : v;
        return <a onClick={() => openCase(v)} className="text-indigo-600 hover:underline cursor-pointer font-mono text-xs">{shortId}</a>;
      },
    },
    {
      title: '状态', dataIndex: 'human_status', width: 80, align: 'center' as const,
      render: (v: string | null) => humanStatusTag(v),
      filters: [
        { text: '通过', value: 'pass' },
        { text: '失败', value: 'fail' },
        { text: '待定', value: 'pending' },
        { text: '未标注', value: '' },
      ],
      onFilter: (value: string, record: CaseSummary) => (record.human_status || '') === value,
    },
    {
      title: '分类', dataIndex: 'category', width: 130,
      render: (v: string | null) => v || '—',
      filters: [...new Set(cases.map(c => c.category).filter(Boolean))].map(c => ({ text: c!, value: c! })),
      onFilter: (value: string, record: CaseSummary) => record.category === value,
    },
    {
      title: '首轮 Prompt', dataIndex: 'situation', ellipsis: true,
      render: (v: string | null) => <span className="text-xs text-gray-600">{v?.slice(0, 80) || '—'}</span>,
    },
    { title: '轮次', dataIndex: 'eval_turns', width: 60, align: 'center' as const },
    {
      title: 'TTFT', dataIndex: 'avg_ttft', width: 70, align: 'center' as const,
      render: (v: number) => v ? `${v}ms` : '-',
    },
    {
      title: '备注', dataIndex: 'human_note', width: 150, ellipsis: true,
      render: (v: string | null) => v ? <span className="text-xs text-gray-500">{v}</span> : '-',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">{runId.replace('academic-', '').slice(0, 25)}</h2>
              {runMeta?.mode && <Tag color={runMeta.mode === 'product' ? 'purple' : 'arcoblue'} size="small">{runMeta.mode}</Tag>}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              模型: {runMeta?.model || '-'} | 数据集: {runMeta?.dataset || '-'} | 创建: {runMeta?.timestamp || '-'}
            </div>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">总用例</div>
          <div className="text-2xl font-bold mt-1">{cases.length}</div>
        </Card>
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">通过</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{passCount}</div>
        </Card>
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">错误 (Wrong)</div>
          <div className="text-2xl font-bold mt-1 text-red-500">{failCount}</div>
        </Card>
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">偏离 (Drift)</div>
          <div className="text-2xl font-bold mt-1 text-amber-500">{runMeta?.driftCount || 0}</div>
        </Card>
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">通过率</div>
          <div className="text-2xl font-bold mt-1" style={{ color: passRateHex(passCount + failCount > 0 ? passCount / (passCount + failCount) * 100 : 0) }}>
            {passCount + failCount > 0 ? `${(passCount / (passCount + failCount) * 100).toFixed(1)}%` : '-'}
          </div>
        </Card>
      </div>

      {/* 性能统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">总轮次</div>
          <div className="text-2xl font-bold mt-1">{totalTurns}</div>
        </Card>
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">平均 TTFT</div>
          <div className="text-2xl font-bold mt-1">{avgTtft ? `${avgTtft}ms` : '-'}</div>
        </Card>
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">总耗时</div>
          <div className="text-2xl font-bold mt-1">{totalTimeMs > 0 ? `${(totalTimeMs / 1000).toFixed(1)}s` : '-'}</div>
        </Card>
        <Card className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
          <div className="text-xs text-gray-500">平均耗时/轮</div>
          <div className="text-2xl font-bold mt-1">{totalTurns > 0 ? `${(totalTimeMs / totalTurns / 1000).toFixed(1)}s` : '-'}</div>
        </Card>
      </div>

      {/* 标注进度 */}
      <div className="flex items-center gap-4">
        <Progress percent={cases.length > 0 ? Math.round(annotated / cases.length * 100) : 0}
          style={{ width: 200 }} size="small" color="#165dff" />
        <span className="text-xs text-gray-500">{annotated}/{cases.length} 已标注</span>
        <span className="text-xs text-gray-400">快捷键: J/K 切换, P 通过, F 失败, D 待定</span>
      </div>

      {/* 分类通过率 */}
      {Object.keys(categoryStats).length > 1 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(categoryStats).map(([cat, s]) => (
            <Card key={cat} className="shadow-xs" bodyStyle={{ padding: '8px 12px' }}>
              <div className="text-xs text-gray-500 uppercase">{cat}</div>
              <div className="text-sm font-semibold">{s.total > 0 ? `${(s.pass / s.total * 100).toFixed(0)}%` : '-'} ({s.pass}/{s.total})</div>
            </Card>
          ))}
        </div>
      )}

      {/* AI 改进分析 */}
      <Card className="shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900">AI 改进分析</span>
            {analysisData?.suggestions?.length > 0 && (
              <Tag color="arcoblue" size="small">{analysisData.suggestions.length} 条建议</Tag>
            )}
          </div>
          <div className="flex items-center gap-2">
            {analysisData && (
              <Button size="small" type="text" onClick={() => setAnalysisExpanded(!analysisExpanded)}>
                {analysisExpanded ? '收起' : '展开'}
              </Button>
            )}
            <select
              className="text-xs border border-gray-300 rounded-sm px-2 py-1 bg-white"
              value={analysisProvider}
              onChange={e => setAnalysisProvider(e.target.value)}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="glm">GLM</option>
              <option value="kimi">Kimi</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            <Button type="primary" size="small" loading={analysisLoading} onClick={runAiAnalysis}>
              {analysisData ? '重新分析' : 'AI 分析'}
            </Button>
          </div>
        </div>
        {analysisExpanded && analysisData && (
          <div className="space-y-3">
            {analysisData.summary && (
              <div className="text-xs text-gray-500">{analysisData.summary}{analysisData.provider ? ` (${analysisData.provider})` : ''}</div>
            )}
            {analysisData.tagSummary && Object.keys(analysisData.tagSummary).length > 0 && (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <div className="text-xs text-gray-400 font-medium mb-1.5">失败模式标签</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(analysisData.tagSummary as Record<string, number>)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .map(([tag, count]) => (
                      <Tag key={tag} size="small" color="orangered">{tag} ({count as number})</Tag>
                    ))}
                </div>
              </div>
            )}
            {(analysisData.suggestions || []).map((s: any, i: number) => {
              const layerColors: Record<string, string> = {
                prompt: 'purple', model: 'orange', tool: 'cyan', orchestration: 'arcoblue',
                guardrail: 'red', evaluator: 'gray', data: 'green', engineering: 'gold',
              };
              const priorityColors: Record<string, string> = { high: 'red', medium: 'orange', low: 'gray' };
              return (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Tag size="small" color={layerColors[s.layer] || 'gray'}>{s.layer}</Tag>
                    <Tag size="small" color={priorityColors[s.priority] || 'gray'}>{s.priority}</Tag>
                    <span className="font-medium text-sm text-gray-900">{s.title}</span>
                    <span className="text-xs text-gray-400 ml-auto">{s.failCount} 例</span>
                  </div>
                  <div className="text-xs text-gray-600 mb-1.5">{s.description}</div>
                  {s.dismissal_reason && (
                    <div className="text-xs text-amber-600 bg-amber-50 rounded-sm px-2 py-1 mb-1.5">排除上层: {s.dismissal_reason}</div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {(s.tags || []).map((tag: string) => (
                      <Tag key={tag} size="small" color="orangered">{tag}</Tag>
                    ))}
                    {(s.affectedDimensions || []).map((d: string) => (
                      <Tag key={d} size="small" color="arcoblue">{DIM_LABELS[d] || d}</Tag>
                    ))}
                    {s.targetFile && !/^N\/A/i.test(s.targetFile) && /\.\w+$/.test(s.targetFile) && <span className="text-xs text-gray-400 font-mono ml-auto">{s.targetFile}</span>}
                  </div>
                </div>
              );
            })}
            {(analysisData.suggestions || []).length === 0 && !analysisLoading && (
              <div className="text-sm text-green-600 text-center py-4">所有评测项均通过，无需改进</div>
            )}
          </div>
        )}
        {!analysisData && !analysisLoading && (
          <div className="text-xs text-gray-400 text-center py-4">点击「AI 分析」对失败案例进行多层级改进诊断</div>
        )}
        {analysisLoading && !analysisData && (
          <div className="flex items-center justify-center py-6"><Spin size={24} /><span className="text-xs text-gray-400 ml-2">正在分析失败案例...</span></div>
        )}
      </Card>

      {/* 用例列表 */}
      <Card className="shadow-xs">
        <Table
          columns={caseColumns}
          data={cases}
          rowKey="case_id"
          pagination={cases.length > 30 ? { pageSize: 30 } : false}
          size="small"
          noDataElement={<Empty description="暂无评测结果" />}
        />
      </Card>

      {/* ===== 用例详情弹窗 ===== */}
      <Modal
        title={null}
        visible={caseModalVisible}
        onCancel={() => { setCaseModalVisible(false); setSelectedCase(null); }}
        footer={null}
        closable={false}
        style={{ width: 960, maxWidth: '95vw', top: 40 }}
        unmountOnExit
      >
        <Spin loading={caseLoading}>
          {selectedCase && (
            <div className="space-y-4">
              {/* 头部：用例 ID + 导航 + 关闭 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">用例 {selectedCase.caseId.includes(':') ? selectedCase.caseId.split(':').pop() : selectedCase.caseId}</h3>
                  {humanStatusTag(selectedCase.results?.[0]?.human_status)}
                </div>
                <div className="flex items-center gap-1">
                  <Button icon={<IconLeft />} size="small" disabled={!selectedCase.navigation.prev}
                    onClick={() => navigateCase('prev')}>上一个</Button>
                  <span className="text-xs text-gray-400 mx-1">
                    {selectedCase.navigation.current}/{selectedCase.navigation.total}
                  </span>
                  <Button size="small" disabled={!selectedCase.navigation.next}
                    onClick={() => navigateCase('next')}>
                    下一个 <IconRight />
                  </Button>
                  <div className="w-px h-5 bg-gray-200 mx-1.5" />
                  <Button size="small" type="text"
                    onClick={() => { setCaseModalVisible(false); setSelectedCase(null); }}
                    className="text-gray-400 hover:text-gray-600"
                  >✕</Button>
                </div>
              </div>

              {/* 标注区 — 紧凑单行，点击展开详细编辑 */}
              <div className="bg-gray-50 rounded-lg px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs text-gray-400 shrink-0">标注</span>
                <div className="flex gap-1.5">
                  {[
                    { value: 'pass', label: '✓ 通过', active: 'bg-green-600 text-white', idle: 'bg-white border border-gray-200 hover:bg-green-50 text-gray-600' },
                    { value: 'fail', label: '✗ 失败', active: 'bg-red-600 text-white', idle: 'bg-white border border-gray-200 hover:bg-red-50 text-gray-600' },
                    { value: 'pending', label: '… 待定', active: 'bg-gray-600 text-white', idle: 'bg-white border border-gray-200 hover:bg-gray-100 text-gray-600' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => { setAnnotStatus(opt.value); saveAnnotation(opt.value); }}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${annotStatus === opt.value ? opt.active : opt.idle}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <Input size="mini" placeholder="标签（逗号分隔）" value={annotTags} onChange={setAnnotTags}
                    onPressEnter={() => saveAnnotation()} />
                </div>
                <div className="flex-1 min-w-0">
                  <Input size="mini" placeholder="备注..." value={annotNote} onChange={setAnnotNote}
                    onPressEnter={() => saveAnnotation()} />
                </div>
                <Button size="mini" type="primary" loading={annotSaving} onClick={() => saveAnnotation()}>
                  保存
                </Button>
              </div>

              {/* 对话详情 Tabs */}
              <Tabs defaultActiveTab="dialog" type="rounded" size="small">
                <TabPane key="dialog" title="对话详情">
                  {/* 元信息内联 */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-3 px-1">
                    <span>模型: <b className="text-gray-700">{runMeta?.model || '-'}</b></span>
                    <span>轮次: <b className="text-gray-700">{selectedCase.results.length}</b></span>
                    <span>耗时: <b className="text-gray-700">{selectedCase.results.reduce((s, t) => s + (t.total_ms || 0), 0)}ms</b></span>
                    <span>状态: <b className="text-gray-700">{runMeta?.status || '-'}</b></span>
                  </div>
                  <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                    {selectedCase.results.map((t, idx) => {
                      const judges = t.judge_results_json ? JSON.parse(t.judge_results_json) : {};
                      const codes = t.code_checks_json ? JSON.parse(t.code_checks_json) : {};
                      // 非通过项：Wrong/Drift(LLM) + fail(代码检查)
                      const nonPass = [
                        ...Object.entries(judges).filter(([, v]: any) => normalizeJudgeResult((v as any).result) !== 'Pass'),
                        ...Object.entries(codes).filter(([, v]) => v !== 'pass'),
                      ];
                      const hasWrong = Object.values(judges).some((v: any) => normalizeJudgeResult(v.result) === 'Wrong')
                        || Object.values(codes).some((v: any) => v === 'fail');
                      const allPass = nonPass.length === 0;
                      // 状态标签：全通过 → PASS，有 Wrong → WRONG，仅 Drift → DRIFT
                      const statusLabel = allPass ? 'PASS' : hasWrong ? 'WRONG' : 'DRIFT';
                      const statusColor = allPass ? 'green' : hasWrong ? 'red' : 'orangered';
                      const agentTrace: AgentTraceStep[] = t.agent_trace_json ? (() => { try { return JSON.parse(t.agent_trace_json); } catch { return []; } })() : [];

                      return (
                        <div key={t.turn_index} className="border rounded-lg p-3">
                          {agentTrace.length > 0 && <AgentTimeline trace={agentTrace} />}
                          <div className="flex items-center gap-2 mb-2">
                            <Tag size="small" color="gray">第 {idx + 1} 轮</Tag>
                            <Tag size="small" color={statusColor}>{statusLabel}</Tag>
                            <span className="text-xs text-gray-400">{t.ttft_ms}ms</span>
                            {t.route_type && <Tag size="small" color="cyan">{t.route_type}</Tag>}
                            {t.reference_strategy && <Tag size="small" color="purple">{t.reference_strategy}</Tag>}
                          </div>
                          <div className="grid grid-cols-[2fr_3fr] gap-2">
                            <div className="bg-blue-50 rounded-sm p-2.5">
                              <div className="text-xs text-blue-500 font-medium mb-1">用户</div>
                              <div className="text-sm text-gray-700">{t.user_input}</div>
                            </div>
                            <div className={`rounded-sm p-2.5 ${allPass ? 'bg-green-50' : hasWrong ? 'bg-red-50' : 'bg-amber-50'}`}>
                              <div className={`text-xs font-medium mb-1 ${allPass ? 'text-green-600' : hasWrong ? 'text-red-500' : 'text-amber-600'}`}>AI</div>
                              <div className="text-sm text-gray-700 whitespace-pre-wrap">{t.ai_reply}</div>
                            </div>
                          </div>
                          {t.reference_reply && (
                            <details className="mt-2">
                              <summary className="text-xs text-purple-500 cursor-pointer hover:text-purple-700">
                                {t.ai_reply ? '查看参考回复 Diff' : '查看参考回复'}
                              </summary>
                              <div className="bg-purple-50 rounded-sm p-2.5 mt-1">
                                {t.ai_reply ? (
                                  <DiffView reference={t.reference_reply} actual={t.ai_reply} />
                                ) : (
                                  <div className="text-sm text-gray-600">{t.reference_reply}</div>
                                )}
                              </div>
                            </details>
                          )}
                          {nonPass.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {nonPass.map(([dim, v]: any) => {
                                const isJudge = typeof v === 'object' && v.result;
                                const normalized = isJudge ? normalizeJudgeResult(v.result) : null;
                                const isDrift = normalized === 'Drift';
                                return (
                                  <div key={dim} className={`text-xs rounded-sm px-2 py-1 ${isDrift ? 'text-amber-700 bg-amber-50' : 'text-red-600 bg-red-50'}`}>
                                    <b>{DIM_LABELS[dim] || dim}{isDrift ? ' [偏离]' : ''}:</b> {isJudge ? v.critique : '未通过'}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </TabPane>

                <TabPane key="graders" title="评分器">
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {selectedCase.results.map(t => {
                      const judges = t.judge_results_json ? JSON.parse(t.judge_results_json) : {};
                      const codes = t.code_checks_json ? JSON.parse(t.code_checks_json) : {};
                      return (
                        <Card key={t.turn_index} className="shadow-xs" bodyStyle={{ padding: '12px 16px' }}>
                          <div className="text-xs font-medium text-gray-500 mb-2">Turn {t.turn_index + 1}</div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.entries({ ...codes }).map(([check, result]) => (
                              <div key={check} className="flex items-center gap-2 text-xs">
                                <Tag size="small" color="green">CODE</Tag>
                                <span className="text-gray-600">{DIM_LABELS[check] || check}</span>
                                <Tag size="small" color={result === 'pass' ? 'green' : 'red'}>{result === 'pass' ? 'Pass' : 'Wrong'}</Tag>
                              </div>
                            ))}
                            {Object.entries(judges).map(([dim, v]: any) => {
                              const nr = normalizeJudgeResult(v.result);
                              return (
                                <div key={dim} className="flex items-center gap-2 text-xs">
                                  <Tag size="small" color="orange">LLM</Tag>
                                  <span className="text-gray-600">{DIM_LABELS[dim] || dim}</span>
                                  <Tag size="small" color={judgeResultColor(v.result)}>{nr}</Tag>
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </TabPane>

                <TabPane key="ai-analysis" title="AI 分析">
                  <div className="max-h-[60vh] overflow-y-auto">
                    {!caseAnalysisData && !caseAnalysisLoading && (
                      <div className="flex flex-col items-center justify-center py-10">
                        <p className="text-sm text-gray-400 mb-3">对当前用例进行 AI 深度分析</p>
                        <Button type="primary" size="small" onClick={() => runCaseAiAnalysis(selectedCase.caseId)}>
                          开始分析
                        </Button>
                      </div>
                    )}
                    {caseAnalysisLoading && (
                      <div className="flex items-center justify-center py-10">
                        <Spin size={24} />
                        <span className="text-xs text-gray-400 ml-2">正在分析用例...</span>
                      </div>
                    )}
                    {caseAnalysisData && (
                      <div className="space-y-3">
                        {caseAnalysisData.summary && (
                          <div className="text-xs text-gray-500 mb-2">{caseAnalysisData.summary}</div>
                        )}
                        {(caseAnalysisData.suggestions || []).map((s: any, i: number) => {
                          const layerColors: Record<string, string> = {
                            prompt: 'purple', model: 'orange', tool: 'cyan', orchestration: 'arcoblue',
                            guardrail: 'red', evaluator: 'gray', data: 'green', engineering: 'gold',
                          };
                          const priorityColors: Record<string, string> = { high: 'red', medium: 'orange', low: 'gray' };
                          return (
                            <div key={i} className="border border-gray-100 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <Tag size="small" color={layerColors[s.layer] || 'gray'}>{s.layer}</Tag>
                                <Tag size="small" color={priorityColors[s.priority] || 'gray'}>{s.priority}</Tag>
                                {s.turnIndex !== undefined && <Tag size="small" color="gray">Turn {s.turnIndex + 1}</Tag>}
                                <span className="font-medium text-sm text-gray-900">{s.title}</span>
                              </div>
                              <div className="text-xs text-gray-600 mb-1.5">{s.description}</div>
                              {s.dismissal_reason && (
                                <div className="text-xs text-amber-600 bg-amber-50 rounded-sm px-2 py-1 mb-1.5">排除上层: {s.dismissal_reason}</div>
                              )}
                              {s.betterReply && (
                                <div className="bg-green-50 border border-green-100 rounded-lg p-2.5 mb-1.5">
                                  <div className="text-xs text-green-700 font-medium mb-1">更好的回复示例</div>
                                  <div className="text-xs text-green-800">{s.betterReply}</div>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1">
                                {(s.tags || []).map((tag: string) => (
                                  <Tag key={tag} size="small" color="orangered">{tag}</Tag>
                                ))}
                                {(s.affectedDimensions || []).map((d: string) => (
                                  <Tag key={d} size="small" color="arcoblue">{DIM_LABELS[d] || d}</Tag>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {(caseAnalysisData.suggestions || []).length === 0 && (
                          <div className="text-sm text-green-600 text-center py-6">所有评测项均通过，无需改进</div>
                        )}
                        <div className="pt-2">
                          <Button size="small" type="text" onClick={() => { setCaseAnalysisData(null); runCaseAiAnalysis(selectedCase.caseId); }}>
                            重新分析
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </TabPane>

              </Tabs>
            </div>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
