'use client';

import { useState, useEffect, useCallback } from 'react';

/* ---------- Types ---------- */

interface TraceStep {
  agent: string;
  startMs: number;
  durationMs: number;
  model?: string;
  skipped?: boolean;
  result?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
}

interface TraceEvalItem {
  id: number;
  conversationId: string;
  userMessage: string;
  aiReply?: string;
  traceScore: number;
  traceGrade: string;
  traceJson: string;
  triageResult?: string;
  triageCritique?: string;
  safetyResult?: string;
  safetyCritique?: string;
  personaResult?: string;
  personaCritique?: string;
  emotionResult?: string;
  emotionCritique?: string;
  toolResult?: string;
  toolCritique?: string;
  guardResult?: string;
  guardCritique?: string;
  expectedSceneId?: string | null;
  expectedWebSearchNeed?: string | null;
  expectedShouldSearch?: boolean | null;
  evaluatedAt: string;
  convEvalId?: string;
}

interface StepPassRate {
  pass: number;
  wrong: number;
  drift: number;
  skip: number;
  total: number;
}

interface TraceStats {
  total: number;
  avgScore: number;
  gradeDistribution: Record<string, number>;
  stepPassRates: Record<string, StepPassRate>;
  truthMatchRates: {
    scene: { labeled: number; matched: number; mismatched: number };
    webSearchNeed: { labeled: number; matched: number; mismatched: number };
    shouldSearch: { labeled: number; matched: number; mismatched: number };
  };
}

interface TracePredictions {
  sceneId: string | null;
  webSearchNeed: string | null;
  shouldSearch: boolean | null;
}

interface TruthBadge {
  key: string;
  label: string;
  matched: boolean;
}

interface TruthMismatchState {
  scene: boolean | null;
  need: boolean | null;
  shouldSearch: boolean | null;
  labeledCount: number;
  mismatchCount: number;
  hasMismatch: boolean;
}

type TruthFilterMode = 'all' | 'any' | 'scene' | 'need' | 'should-search';
type TraceSortMode = 'truth-first' | 'score';

/* ---------- 常量 ---------- */

const STEP_LABELS: Record<string, string> = {
  triage: '路由分流',
  safety: '安全检测',
  persona: '角色选择',
  emotion: '情绪识别',
  tool: '工具调用',
  guard: '输出防护',
};

const STEP_KEYS = ['triage', 'safety', 'persona', 'emotion', 'tool', 'guard'] as const;

const GRADE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  A: { bg: 'bg-green-100', text: 'text-green-800', bar: 'bg-green-500' },
  B: { bg: 'bg-blue-100', text: 'text-blue-800', bar: 'bg-blue-500' },
  C: { bg: 'bg-yellow-100', text: 'text-yellow-800', bar: 'bg-yellow-500' },
  D: { bg: 'bg-orange-100', text: 'text-orange-800', bar: 'bg-orange-500' },
  F: { bg: 'bg-red-100', text: 'text-red-800', bar: 'bg-red-500' },
};

const VERDICT_STYLES: Record<string, string> = {
  Pass: 'bg-green-100 text-green-800',
  Drift: 'bg-yellow-100 text-yellow-800',
  Wrong: 'bg-red-100 text-red-800',
  Skip: 'bg-gray-100 text-gray-500',
};

/* ---------- 辅助函数 ---------- */

function passRateColor(rate: number): string {
  if (rate >= 95) return '#16a34a';
  if (rate >= 80) return '#2563eb';
  if (rate >= 70) return '#f97316';
  return '#dc2626';
}

function normalizeVerdict(result?: string): string {
  if (!result) return 'Skip';
  if (result === 'Pass') return 'Pass';
  if (result === 'Drift') return 'Drift';
  if (result === 'Skip' || result === 'skip') return 'Skip';
  return 'Wrong';
}

function getFailedSteps(item: TraceEvalItem): Array<{ step: string; verdict: string }> {
  const failed: Array<{ step: string; verdict: string }> = [];
  for (const key of STEP_KEYS) {
    const resultKey = `${key}Result` as keyof TraceEvalItem;
    const result = item[resultKey] as string | undefined;
    const verdict = normalizeVerdict(result);
    if (verdict === 'Wrong' || verdict === 'Drift') {
      failed.push({ step: key, verdict });
    }
  }
  return failed;
}

function parseTraceSteps(traceJson?: string): TraceStep[] {
  if (!traceJson) return [];
  try {
    const parsed = JSON.parse(traceJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractPredictionsFromTrace(traceJson?: string): TracePredictions {
  const steps = parseTraceSteps(traceJson);
  const triageStep = steps.find((step) => step.agent === 'triage');
  const webSearchStep = steps.find((step) => step.agent === 'websearch');

  const sceneId =
    typeof triageStep?.output?.scene?.id === 'string'
      ? triageStep.output.scene.id
      : typeof webSearchStep?.input?.sceneId === 'string'
        ? webSearchStep.input.sceneId
        : null;

  const webSearchNeed =
    typeof webSearchStep?.input?.need === 'string'
      ? webSearchStep.input.need
      : null;

  const shouldSearch =
    webSearchStep?.result === 'completed' || webSearchStep?.result === 'failed'
      ? true
      : webSearchStep?.result === 'skipped' || webSearchStep?.result === 'not_needed'
        ? false
        : null;

  return {
    sceneId,
    webSearchNeed,
    shouldSearch,
  };
}

function buildTruthBadges(item: TraceEvalItem): TruthBadge[] {
  const predicted = extractPredictionsFromTrace(item.traceJson);
  const badges: TruthBadge[] = [];

  if (item.expectedSceneId) {
    badges.push({
      key: 'scene',
      label: 'S',
      matched: predicted.sceneId === item.expectedSceneId,
    });
  }

  if (item.expectedWebSearchNeed) {
    badges.push({
      key: 'need',
      label: 'N',
      matched: predicted.webSearchNeed === item.expectedWebSearchNeed,
    });
  }

  if (typeof item.expectedShouldSearch === 'boolean') {
    badges.push({
      key: 'should-search',
      label: 'Q',
      matched: predicted.shouldSearch === item.expectedShouldSearch,
    });
  }

  return badges;
}

function getTruthMismatchState(item: TraceEvalItem): TruthMismatchState {
  const predicted = extractPredictionsFromTrace(item.traceJson);
  const scene = item.expectedSceneId ? predicted.sceneId !== item.expectedSceneId : null;
  const need = item.expectedWebSearchNeed ? predicted.webSearchNeed !== item.expectedWebSearchNeed : null;
  const shouldSearch =
    typeof item.expectedShouldSearch === 'boolean'
      ? predicted.shouldSearch !== item.expectedShouldSearch
      : null;

  const mismatchCount = [scene, need, shouldSearch].filter((value) => value === true).length;
  const labeledCount = [scene, need, shouldSearch].filter((value) => value !== null).length;

  return {
    scene,
    need,
    shouldSearch,
    labeledCount,
    mismatchCount,
    hasMismatch: mismatchCount > 0,
  };
}

function matchesTruthFilter(mismatch: TruthMismatchState, filter: TruthFilterMode): boolean {
  if (filter === 'all') return true;
  if (filter === 'any') return mismatch.hasMismatch;
  if (filter === 'scene') return mismatch.scene === true;
  if (filter === 'need') return mismatch.need === true;
  return mismatch.shouldSearch === true;
}

function compareTraceItems(
  left: { item: TraceEvalItem; mismatch: TruthMismatchState },
  right: { item: TraceEvalItem; mismatch: TruthMismatchState },
  sortMode: TraceSortMode,
): number {
  if (sortMode === 'truth-first') {
    const mismatchDelta = right.mismatch.mismatchCount - left.mismatch.mismatchCount;
    if (mismatchDelta !== 0) return mismatchDelta;

    const labeledDelta = right.mismatch.labeledCount - left.mismatch.labeledCount;
    if (labeledDelta !== 0) return labeledDelta;
  }

  const scoreDelta = left.item.traceScore - right.item.traceScore;
  if (scoreDelta !== 0) return scoreDelta;

  return new Date(right.item.evaluatedAt).getTime() - new Date(left.item.evaluatedAt).getTime();
}

/* ---------- 组件 ---------- */

export default function TraceAnalysisPage() {
  const [data, setData] = useState<TraceEvalItem[]>([]);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [truthFilter, setTruthFilter] = useState<TruthFilterMode>('any');
  const [sortMode, setSortMode] = useState<TraceSortMode>('truth-first');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (gradeFilter !== 'all') params.set('grade', gradeFilter);
      const res = await fetch(`/api/eval/trace?${params}`);
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      const json = await res.json();
      setData(json.data || []);
      setStats(json.stats || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [gradeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = (id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const enrichedData = data.map((item) => ({
    item,
    mismatch: getTruthMismatchState(item),
  }));
  const labeledCount = enrichedData.filter(({ mismatch }) => mismatch.labeledCount > 0).length;
  const mismatchCount = enrichedData.filter(({ mismatch }) => mismatch.hasMismatch).length;
  const filteredData = enrichedData.filter(({ mismatch }) => matchesTruthFilter(mismatch, truthFilter));
  const displayedData = [...filteredData].sort((left, right) => compareTraceItems(left, right, sortMode));

  const filterSummary =
    truthFilter === 'all'
      ? `已标注 ${labeledCount} 条，未命中 ${mismatchCount} 条`
      : truthFilter === 'any'
        ? `当前筛出 ${filteredData.length} 条真值未命中样本`
        : truthFilter === 'scene'
          ? `当前筛出 ${filteredData.length} 条 Scene 未命中样本`
          : truthFilter === 'need'
            ? `当前筛出 ${filteredData.length} 条 Search Need 未命中样本`
            : `当前筛出 ${filteredData.length} 条 Should Search 未命中样本`;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">轨迹分析</h2>
          <p className="text-sm text-gray-500">Agent 执行链路的逐步评测与诊断</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1"
          >
            <option value="all">全部等级</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="F">F</option>
          </select>
          <button
            onClick={fetchData}
            className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            刷新
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : error ? (
        <div className="text-center py-20 text-red-500">{error}</div>
      ) : (
        <>
          {/* 步骤 Pass Rate 卡片 */}
          <StepPassRateCards stats={stats} />

          {/* 真值命中卡片 */}
          <TruthMatchCards stats={stats} />

          {/* 评分分布图 */}
          <GradeDistributionChart stats={stats} />

          {/* 低分轨迹列表 */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  轨迹列表
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    {displayedData.length} 条
                    {gradeFilter !== 'all' ? ` (等级 ${gradeFilter})` : ''}
                  </span>
                </h3>
                <div className="mt-1 text-xs text-gray-500">
                  {filterSummary}
                  <span className="ml-2 text-gray-400">
                    {sortMode === 'truth-first' ? '当前按误差优先排序' : '当前按评分升序排序'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={truthFilter}
                  onChange={e => setTruthFilter(e.target.value as TruthFilterMode)}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="any">只看真值误差</option>
                  <option value="all">全部样本</option>
                  <option value="scene">只看 Scene 未命中</option>
                  <option value="need">只看 Search Need 未命中</option>
                  <option value="should-search">只看 Should Search 未命中</option>
                </select>
                <select
                  value={sortMode}
                  onChange={e => setSortMode(e.target.value as TraceSortMode)}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1"
                >
                  <option value="truth-first">误差优先</option>
                  <option value="score">按评分升序</option>
                </select>
              </div>
            </div>

            {displayedData.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">暂无轨迹评测数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium w-[120px]">对话 ID</th>
                      <th className="pb-2 font-medium">用户消息预览</th>
                      <th className="pb-2 font-medium w-[70px] text-center">评分</th>
                      <th className="pb-2 font-medium w-[50px] text-center">等级</th>
                      <th className="pb-2 font-medium w-[90px] text-center">真值</th>
                      <th className="pb-2 font-medium w-[200px]">失败步骤</th>
                      <th className="pb-2 font-medium w-[140px]">评测时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedData.map(({ item, mismatch }) => (
                        <TraceRow
                          key={item.id}
                          item={item}
                          mismatch={mismatch}
                          expanded={expandedId === item.id}
                          onToggle={() => toggleExpand(item.id)}
                        />
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TruthMatchCards({ stats }: { stats: TraceStats | null }) {
  if (!stats) return null;

  const cards = [
    { key: 'scene', label: 'Scene 命中', data: stats.truthMatchRates.scene },
    { key: 'webSearchNeed', label: 'Search Need 命中', data: stats.truthMatchRates.webSearchNeed },
    { key: 'shouldSearch', label: 'Should Search 命中', data: stats.truthMatchRates.shouldSearch },
  ] as const;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map((card) => {
        const rate = card.data.labeled > 0
          ? Math.round((card.data.matched / card.data.labeled) * 100)
          : 0;

        return (
          <div key={card.key} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div
              className="text-2xl font-bold"
              style={{ color: card.data.labeled > 0 ? passRateColor(rate) : '#9ca3af' }}
            >
              {card.data.labeled > 0 ? `${rate}%` : '-'}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {card.data.labeled > 0
                ? `${card.data.matched}/${card.data.labeled}，未命中 ${card.data.mismatched}`
                : '暂无真值标注'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 步骤 Pass Rate 卡片 ---------- */

function StepPassRateCards({ stats }: { stats: TraceStats | null }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {STEP_KEYS.map(key => {
        const stepStats = stats.stepPassRates[key];
        const total = stepStats?.total || 0;
        const pass = stepStats?.pass || 0;
        const rate = total > 0 ? Math.round((pass / total) * 100) : 0;

        return (
          <div
            key={key}
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            <div className="text-xs text-gray-500 mb-1">{STEP_LABELS[key]}</div>
            <div
              className="text-2xl font-bold"
              style={{ color: total > 0 ? passRateColor(rate) : '#9ca3af' }}
            >
              {total > 0 ? `${rate}%` : '-'}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {total > 0 ? `${pass}/${total}` : '暂无数据'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 评分分布柱状图 ---------- */

function GradeDistributionChart({ stats }: { stats: TraceStats | null }) {
  if (!stats) return null;

  const grades = ['A', 'B', 'C', 'D', 'F'];
  const maxCount = Math.max(...grades.map(g => stats.gradeDistribution[g] || 0), 1);
  const total = stats.total || 1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">评分分布</h3>
        <div className="text-xs text-gray-400">
          总计 {stats.total} 条 | 平均分 {stats.avgScore.toFixed(1)}
        </div>
      </div>

      <div className="flex items-end justify-center gap-6 h-40">
        {grades.map(grade => {
          const count = stats.gradeDistribution[grade] || 0;
          const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          const colors = GRADE_COLORS[grade] || GRADE_COLORS.F;
          const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';

          return (
            <div key={grade} className="flex flex-col items-center gap-1 flex-1 max-w-[80px]">
              {/* 数量标签 */}
              <span className="text-xs text-gray-500 font-mono">{count}</span>
              {/* 柱子 */}
              <div className="w-full flex items-end" style={{ height: '100px' }}>
                <div
                  className={`w-full rounded-t-md transition-all duration-300 ${colors.bar}`}
                  style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                  title={`${grade}: ${count} 条 (${pct}%)`}
                />
              </div>
              {/* 等级标签 */}
              <span
                className={`inline-block px-2.5 py-0.5 rounded-sm text-xs font-medium ${colors.bg} ${colors.text}`}
              >
                {grade}
              </span>
              {/* 百分比 */}
              <span className="text-xs text-gray-400">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 轨迹行（含展开详情） ---------- */

function TraceRow({
  item,
  mismatch,
  expanded,
  onToggle,
}: {
  item: TraceEvalItem;
  mismatch: TruthMismatchState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const failedSteps = getFailedSteps(item);
  const truthBadges = buildTruthBadges(item);
  const gradeColors = GRADE_COLORS[item.traceGrade] || GRADE_COLORS.F;

  return (
    <>
      <tr
        className={`border-b border-gray-100 cursor-pointer transition-colors ${
          mismatch.hasMismatch ? 'bg-rose-50/40 hover:bg-rose-50' : 'hover:bg-gray-50'
        }`}
        onClick={onToggle}
      >
        <td className="py-2 font-mono text-xs text-indigo-600" title={item.conversationId}>
          {item.conversationId.slice(0, 12)}...
        </td>
        <td className="py-2 text-gray-700 max-w-[300px] truncate" title={item.userMessage}>
          {item.userMessage?.slice(0, 60) || '-'}
        </td>
        <td className="py-2 text-center font-mono font-semibold" style={{ color: passRateColor(item.traceScore * 10) }}>
          {item.traceScore.toFixed(1)}
        </td>
        <td className="py-2 text-center">
          <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-medium ${gradeColors.bg} ${gradeColors.text}`}>
            {item.traceGrade}
          </span>
        </td>
        <td className="py-2">
          <div className="flex items-center justify-center gap-1">
            {truthBadges.length === 0 ? (
              <span className="text-xs text-gray-300">-</span>
            ) : (
              truthBadges.map((badge) => (
                <span
                  key={badge.key}
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                    badge.matched
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                  title={`${badge.label}: ${badge.matched ? '命中' : '未命中'}`}
                >
                  {badge.label}
                </span>
              ))
            )}
          </div>
        </td>
        <td className="py-2">
          <div className="flex flex-wrap gap-1">
            {failedSteps.length === 0 ? (
              <span className="text-xs text-gray-400">-</span>
            ) : (
              failedSteps.map(({ step, verdict }) => (
                <span
                  key={step}
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                    verdict === 'Wrong'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              ))
            )}
          </div>
        </td>
        <td className="py-2 text-gray-400 text-xs">
          {new Date(item.evaluatedAt).toLocaleString('zh-CN')}
        </td>
      </tr>

      {/* 展开详情 */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <TraceDetail item={item} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ---------- 轨迹详情展开区 ---------- */

function TraceDetail({ item }: { item: TraceEvalItem }) {
  // 解析 trace JSON
  const traceSteps = parseTraceSteps(item.traceJson);
  const predictions = extractPredictionsFromTrace(item.traceJson);

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 space-y-4">
      {/* 时序图 */}
      {traceSteps.length > 0 && <TraceTimeline steps={traceSteps} />}

      {/* 评分计算说明 */}
      <ScoreBreakdown item={item} />

      {/* 步骤评分卡片 */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 mb-3">步骤评分详情</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {STEP_KEYS.map(key => {
            const resultKey = `${key}Result` as keyof TraceEvalItem;
            const critiqueKey = `${key}Critique` as keyof TraceEvalItem;
            const result = item[resultKey] as string | undefined;
            const critique = item[critiqueKey] as string | undefined;
            const verdict = normalizeVerdict(result);
            const verdictStyle = VERDICT_STYLES[verdict] || VERDICT_STYLES.Skip;

            return (
              <div
                key={key}
                className="bg-white border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">{STEP_LABELS[key]}</span>
                  <span className={`inline-block px-1.5 py-0.5 rounded-sm text-xs font-medium ${verdictStyle}`}>
                    {verdict}
                  </span>
                </div>
                {critique ? (
                  <p className="text-xs text-gray-500 leading-relaxed" title={critique}>
                    {critique}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    {verdict === 'Skip' ? '无数据，跳过评测' : '暂无评语'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 对话内容预览 */}
      {(item.userMessage || item.aiReply) && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-3">对话内容</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {item.userMessage && (
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-blue-500 font-medium mb-1">用户</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{item.userMessage}</div>
              </div>
            )}
            {item.aiReply && (
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-green-600 font-medium mb-1">AI</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{item.aiReply}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {(item.expectedSceneId || item.expectedWebSearchNeed || item.expectedShouldSearch !== null) && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-3">真值标注</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">expectedSceneId</div>
              <div className="text-sm text-gray-700 font-mono">{item.expectedSceneId || '-'}</div>
              <div className="mt-2 text-xs text-gray-400">
                predicted: {predictions.sceneId || '-'}
              </div>
              {item.expectedSceneId && (
                <div className={`mt-2 inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                  predictions.sceneId === item.expectedSceneId
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {predictions.sceneId === item.expectedSceneId ? '命中' : '未命中'}
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">expectedWebSearchNeed</div>
              <div className="text-sm text-gray-700 font-mono">{item.expectedWebSearchNeed || '-'}</div>
              <div className="mt-2 text-xs text-gray-400">
                predicted: {predictions.webSearchNeed || '-'}
              </div>
              {item.expectedWebSearchNeed && (
                <div className={`mt-2 inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                  predictions.webSearchNeed === item.expectedWebSearchNeed
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {predictions.webSearchNeed === item.expectedWebSearchNeed ? '命中' : '未命中'}
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">expectedShouldSearch</div>
              <div className="text-sm text-gray-700 font-mono">
                {item.expectedShouldSearch === null || item.expectedShouldSearch === undefined
                  ? '-'
                  : item.expectedShouldSearch ? 'true' : 'false'}
              </div>
              <div className="mt-2 text-xs text-gray-400">
                predicted: {predictions.shouldSearch === null ? '-' : predictions.shouldSearch ? 'true' : 'false'}
              </div>
              {typeof item.expectedShouldSearch === 'boolean' && (
                <div className={`mt-2 inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                  predictions.shouldSearch === item.expectedShouldSearch
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {predictions.shouldSearch === item.expectedShouldSearch ? '命中' : '未命中'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 关联对话评测 */}
      {item.convEvalId && (
        <div className="text-xs text-gray-400">
          关联对话评测 ID: <span className="font-mono text-indigo-500">{item.convEvalId}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- 评分计算说明 ---------- */

function ScoreBreakdown({ item }: { item: TraceEvalItem }) {
  const steps = STEP_KEYS.map(key => {
    const resultKey = `${key}Result` as keyof TraceEvalItem;
    const result = item[resultKey] as string | undefined;
    const verdict = normalizeVerdict(result);
    const score = verdict === 'Pass' ? 1.0 : verdict === 'Drift' ? 0.5 : verdict === 'Wrong' ? 0.0 : null;
    return { key, label: STEP_LABELS[key], verdict, score };
  });

  const evaluated = steps.filter(s => s.score !== null);
  const skipped = steps.filter(s => s.score === null);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-gray-500 mb-3">评分计算</h4>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-gray-500">得分 =</span>
        <span className="text-gray-400">(</span>
        {evaluated.map((s, i) => (
          <span key={s.key} className="flex items-center gap-0.5">
            {i > 0 && <span className="text-gray-400 mx-0.5">+</span>}
            <span className={`px-1.5 py-0.5 rounded-sm font-medium ${VERDICT_STYLES[s.verdict]}`}>
              {s.label} {s.score!.toFixed(1)}
            </span>
          </span>
        ))}
        <span className="text-gray-400">)</span>
        <span className="text-gray-500">÷ {evaluated.length}</span>
        <span className="text-gray-500">=</span>
        <span className="font-bold text-gray-900">{item.traceScore.toFixed(1)}</span>
        <span className={`px-1.5 py-0.5 rounded-sm font-medium ${(GRADE_COLORS[item.traceGrade] || GRADE_COLORS.F).bg} ${(GRADE_COLORS[item.traceGrade] || GRADE_COLORS.F).text}`}>
          {item.traceGrade}
        </span>
        {skipped.length > 0 && (
          <span className="text-gray-400 ml-2">
            ({skipped.map(s => s.label).join('、')} 跳过)
          </span>
        )}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Pass=1.0 | Drift=0.5 | Wrong=0.0 | Skip 不计入
      </p>
    </div>
  );
}

/* ---------- 时序图（Gantt 风格） ---------- */

function TraceTimeline({ steps }: { steps: TraceStep[] }) {
  if (steps.length === 0) return null;

  const maxMs = Math.max(...steps.map(s => (s.startMs || 0) + (s.durationMs || 0)), 1);

  const agentColors: Record<string, { bg: string; border: string; text: string }> = {
    prefetch: { bg: 'bg-gray-200', border: 'border-gray-300', text: 'text-gray-700' },
    triage: { bg: 'bg-blue-200', border: 'border-blue-300', text: 'text-blue-800' },
    safety: { bg: 'bg-orange-200', border: 'border-orange-300', text: 'text-orange-800' },
    persona: { bg: 'bg-purple-200', border: 'border-purple-300', text: 'text-purple-800' },
    emotion: { bg: 'bg-indigo-200', border: 'border-indigo-300', text: 'text-indigo-800' },
    counselor: { bg: 'bg-green-200', border: 'border-green-300', text: 'text-green-800' },
    tool: { bg: 'bg-cyan-200', border: 'border-cyan-300', text: 'text-cyan-800' },
    guard: { bg: 'bg-red-200', border: 'border-red-300', text: 'text-red-800' },
    quality: { bg: 'bg-emerald-200', border: 'border-emerald-300', text: 'text-emerald-800' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-500">执行时序</h4>
        <span className="text-xs text-gray-400 font-mono">总计 {maxMs}ms</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5">
        {steps.map((step, i) => {
          const left = maxMs > 0 ? ((step.startMs || 0) / maxMs) * 100 : 0;
          const widthPct = maxMs > 0 ? ((step.durationMs || 0) / maxMs) * 100 : 0;
          const isNarrow = widthPct < 8; // 太窄就把耗时标签放外面
          const colors = agentColors[step.agent] || agentColors.prefetch;
          const durationLabel = step.durationMs >= 1000
            ? `${(step.durationMs / 1000).toFixed(1)}s`
            : `${step.durationMs || 0}ms`;

          return (
            <div key={i} className="flex items-center gap-2">
              {/* 标签 */}
              <div className="w-20 text-right shrink-0">
                <span className={`text-xs font-medium ${step.skipped ? 'text-gray-400 line-through' : colors.text}`}>
                  {STEP_LABELS[step.agent] || step.agent}
                </span>
              </div>
              {/* 时间条 */}
              <div className="flex-1 h-6 bg-gray-50 rounded-sm relative">
                <div
                  className={`absolute top-0 h-full rounded border ${
                    step.skipped ? 'bg-gray-100 border-gray-200' : `${colors.bg} ${colors.border}`
                  } flex items-center transition-all duration-300`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(widthPct, 1.5)}%`,
                  }}
                  title={`${STEP_LABELS[step.agent] || step.agent}: 开始 ${step.startMs}ms, 耗时 ${step.durationMs}ms${step.result ? `, 结果: ${step.result}` : ''}`}
                >
                  {!isNarrow && (
                    <span className="text-[10px] font-mono text-gray-600 px-1.5 truncate">
                      {durationLabel}
                    </span>
                  )}
                </div>
                {/* 窄条：耗时标签放在条的右侧 */}
                {isNarrow && (
                  <span
                    className="absolute top-0.5 text-[10px] font-mono text-gray-500"
                    style={{ left: `${Math.min(left + widthPct + 1, 92)}%` }}
                  >
                    {durationLabel}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
