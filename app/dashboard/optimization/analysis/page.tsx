'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Empty, Spin, Select, Input, Message } from '@arco-design/web-react';
import { useRouter } from 'next/navigation';
import { DIM_LABELS } from '@/lib/eval/constants';

/* ---------- Types ---------- */

interface EvalRun {
  runId: string;
  dataset: string;
  passRate: number;
  failCount: number;
  driftCount?: number;
}

interface Suggestion {
  layer: string;
  title: string;
  description: string;
  dismissal_reason?: string;
  tags?: string[];
  targetFile?: string;
  affectedDimensions: string[];
  priority: string;
  failCount: number;
  status?: 'accepted' | 'rejected' | 'deferred';
  note?: string;
  statusUpdatedAt?: string;
}

interface AnalysisResult {
  suggestions: Suggestion[];
  summary: string;
  provider: string;
  failCount: number;
  dimCounts: Record<string, number>;
  tagSummary?: Record<string, number>;
  analyzedAt: string;
}

const LAYER_LABELS: Record<string, string> = {
  orchestration: '编排 & 架构',
  engineering: '工程 & 代码',
  guardrail: '防护规则',
  evaluator: '评估器',
  data: '数据',
  model: '模型',
  prompt: '提示词',
};

const LAYER_ORDER = ['orchestration', 'engineering', 'guardrail', 'evaluator', 'data', 'model', 'prompt'];

const LAYER_COLORS: Record<string, string> = {
  orchestration: 'arcoblue', engineering: 'gold', guardrail: 'red',
  evaluator: 'gray', data: 'green', model: 'orange', prompt: 'purple',
};

const PRIORITY_COLORS: Record<string, string> = { high: 'red', medium: 'orange', low: 'gray' };

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  accepted: { label: '已采纳', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  rejected: { label: '已拒绝', color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  deferred: { label: '搁置', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
};

/** 过滤 LLM 编造的无效 targetFile */
function isValidTargetFile(f?: string): boolean {
  if (!f) return false;
  if (/^N\/A/i.test(f)) return false;
  if (!/\.\w+$/.test(f)) return false; // 没有文件扩展名
  return true;
}

/* ---------- Component ---------- */

export default function RootCauseOverviewPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<number | null>(null); // suggestion 全局 index
  const [noteInput, setNoteInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProvider, setAnalysisProvider] = useState<string>('deepseek');

  // 更新建议状态
  const updateSuggestionStatus = useCallback(async (globalIndex: number, status: string) => {
    if (!selectedRun || !analysis) return;
    const updated = { ...analysis, suggestions: [...analysis.suggestions] };
    updated.suggestions[globalIndex] = { ...updated.suggestions[globalIndex], status: status as any, statusUpdatedAt: new Date().toISOString() };
    setAnalysis(updated);
    await fetch('/api/eval/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: selectedRun, action: 'update-status', index: globalIndex, status, provider: analysis.provider }),
    });
  }, [selectedRun, analysis]);

  // 保存备注
  const saveNote = useCallback(async (globalIndex: number) => {
    if (!selectedRun || !analysis) return;
    const updated = { ...analysis, suggestions: [...analysis.suggestions] };
    updated.suggestions[globalIndex] = { ...updated.suggestions[globalIndex], note: noteInput, statusUpdatedAt: new Date().toISOString() };
    setAnalysis(updated);
    setEditingNote(null);
    await fetch('/api/eval/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: selectedRun, action: 'update-status', index: globalIndex, note: noteInput, provider: analysis.provider }),
    });
    Message.success('备注已保存');
  }, [selectedRun, analysis, noteInput]);

  // 加载实验列表
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/eval/runs');
        if (res.ok) {
          const data = await res.json();
          setRuns(data.runs || []);
          const firstFail = (data.runs || []).find((r: EvalRun) => r.failCount > 0);
          if (firstFail) setSelectedRun(firstFail.runId);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // 加载分析缓存（只读，不触发新分析）
  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true);
    setFilterTag(null);
    (async () => {
      try {
        // 只读缓存，不触发新的 LLM 分析
        const res = await fetch('/api/eval/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: selectedRun, cacheOnly: true }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions?.length > 0) {
            setAnalysis(data);
          } else {
            setAnalysis(null);
          }
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [selectedRun]);

  // 按层级分组（保留全局 index 用于状态更新）
  const groupedByLayer = (() => {
    if (!analysis) return [];
    type IndexedSuggestion = Suggestion & { _globalIndex: number };
    const indexed: IndexedSuggestion[] = analysis.suggestions.map((s, i) => ({ ...s, _globalIndex: i }));
    const filtered = filterTag
      ? indexed.filter(s => (s.tags || []).includes(filterTag))
      : indexed;
    const groups: Array<{ layer: string; items: IndexedSuggestion[] }> = [];
    for (const layer of LAYER_ORDER) {
      const items = filtered.filter(s => s.layer === layer);
      if (items.length > 0) groups.push({ layer, items });
    }
    const knownLayers = new Set(LAYER_ORDER);
    const unknown = filtered.filter(s => !knownLayers.has(s.layer));
    if (unknown.length > 0) groups.push({ layer: 'other', items: unknown });
    return groups;
  })();

  const goToExperiment = (runId: string) => {
    router.push(`/dashboard/optimization/exp/${encodeURIComponent(runId)}`);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* 实验选择 */}
      <Card className="shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 shrink-0">选择实验</span>
          <Select
            value={selectedRun || undefined}
            onChange={v => setSelectedRun(v)}
            placeholder="选择一个实验..."
            style={{ width: 400 }}
            size="small"
          >
            {runs.map(r => (
              <Select.Option key={r.runId} value={r.runId}>
                <span className="font-mono text-xs">{r.runId}</span>
                <Tag color="arcoblue" size="small" className="ml-2">{r.dataset}</Tag>
                {r.failCount > 0 && <Tag color="red" size="small" className="ml-1">{r.failCount} 错误</Tag>}
                {(r.driftCount || 0) > 0 && <Tag color="orangered" size="small" className="ml-1">{r.driftCount} 偏离</Tag>}
              </Select.Option>
            ))}
          </Select>
          {selectedRun && (
            <button
              className="text-xs text-indigo-500 hover:underline ml-auto"
              onClick={() => goToExperiment(selectedRun)}
            >
              查看实验详情 →
            </button>
          )}
        </div>
      </Card>

      {!selectedRun && <Empty description="请先选择一个实验" />}

      {selectedRun && loading && (
        <div className="flex items-center justify-center py-12">
          <Spin size={24} />
          <span className="text-sm text-gray-400 ml-2">加载分析数据...</span>
        </div>
      )}

      {selectedRun && !loading && !analysis && (
        <Card className="shadow-sm">
          <div className="text-center py-8">
            <div className="text-sm text-gray-500 mb-3">该实验尚未进行 AI 分析</div>
            <div className="flex items-center justify-center gap-2">
              <select
                className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
                value={analysisProvider}
                onChange={e => setAnalysisProvider(e.target.value)}
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="glm">GLM</option>
                <option value="kimi">Kimi</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              <button
                className="px-4 py-1.5 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                disabled={analyzing}
                onClick={async () => {
                  setAnalyzing(true);
                  try {
                    const res = await fetch('/api/eval/analyze', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ runId: selectedRun, provider: analysisProvider }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      if (data.suggestions?.length > 0) {
                        setAnalysis(data);
                        Message.success(`生成 ${data.suggestions.length} 条改进建议`);
                      } else {
                        Message.info('所有评测项均通过，无需改进');
                      }
                    } else {
                      const err = await res.json();
                      Message.error(err.error || 'AI 分析失败');
                    }
                  } catch { Message.error('请求失败'); }
                  finally { setAnalyzing(false); }
                }}
              >
                {analyzing ? '分析中...' : '运行 AI 分析'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {selectedRun && !loading && analysis && (
        <>
          {/* 概览 */}
          <Card className="shadow-sm">
            <div className="flex items-center gap-4 mb-3">
              <div className="text-sm text-gray-700">
                {analysis.summary}
              </div>
              <span className="text-xs text-gray-400 ml-auto">
                {analysis.provider} · {new Date(analysis.analyzedAt).toLocaleString('zh-CN')}
              </span>
            </div>

            {/* 标签频次 */}
            {analysis.tagSummary && Object.keys(analysis.tagSummary).length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <div className="text-xs text-gray-400 font-medium mb-2">失败模式标签（点击过滤）</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(analysis.tagSummary)
                    .sort((a, b) => b[1] - a[1])
                    .map(([tag, count]) => (
                      <Tag
                        key={tag}
                        size="small"
                        color={filterTag === tag ? 'purple' : 'orangered'}
                        className="cursor-pointer hover:opacity-80"
                        onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                      >
                        {tag} ({count})
                      </Tag>
                    ))}
                </div>
                {filterTag && (
                  <div className="mt-2">
                    <button className="text-xs text-purple-500 hover:underline" onClick={() => setFilterTag(null)}>
                      清除过滤
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 层级分布 */}
            <div className="flex flex-wrap gap-2">
              {LAYER_ORDER.map(layer => {
                const count = analysis.suggestions.filter(s => s.layer === layer).length;
                if (count === 0) return null;
                return (
                  <div key={layer} className="flex items-center gap-1">
                    <Tag size="small" color={LAYER_COLORS[layer] || 'gray'}>{LAYER_LABELS[layer] || layer}</Tag>
                    <span className="text-xs text-gray-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 按层级分组展示建议 */}
          {groupedByLayer.map(({ layer, items }) => (
            <Card key={layer} className="shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Tag color={LAYER_COLORS[layer] || 'gray'}>{LAYER_LABELS[layer] || layer}</Tag>
                <span className="text-xs text-gray-400">{items.length} 条建议</span>
              </div>
              <div className="space-y-2.5">
                {items.map((s) => {
                  const gi = s._globalIndex;
                  const statusCfg = s.status ? STATUS_CONFIG[s.status] : null;
                  const isEditing = editingNote === gi;
                  return (
                    <div key={gi} className={`border rounded-lg p-3 ${statusCfg ? statusCfg.bg : 'border-gray-100'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Tag size="small" color={PRIORITY_COLORS[s.priority] || 'gray'}>{s.priority}</Tag>
                        {statusCfg && <Tag size="small" color={s.status === 'accepted' ? 'green' : s.status === 'rejected' ? 'red' : 'orange'}>{statusCfg.label}</Tag>}
                        <span className="font-medium text-sm text-gray-900">{s.title}</span>
                        <span className="text-xs text-gray-400 ml-auto">{s.failCount} 例</span>
                      </div>
                      <div className="text-xs text-gray-600 mb-1.5">{s.description}</div>
                      {s.dismissal_reason && (
                        <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-1.5">排除上层: {s.dismissal_reason}</div>
                      )}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {(s.tags || []).map(tag => (
                          <Tag key={tag} size="small" color={filterTag === tag ? 'purple' : 'orangered'} className="cursor-pointer" onClick={() => setFilterTag(filterTag === tag ? null : tag)}>{tag}</Tag>
                        ))}
                        {(s.affectedDimensions || []).map(d => (
                          <Tag key={d} size="small" color="arcoblue">{DIM_LABELS[d] || d}</Tag>
                        ))}
                        {isValidTargetFile(s.targetFile) && <span className="text-xs text-gray-400 font-mono ml-auto">{s.targetFile}</span>}
                      </div>
                      {/* 状态按钮 + 备注 */}
                      <div className="flex items-center gap-2 pt-1.5 border-t border-gray-100">
                        <button className={`text-xs px-2 py-0.5 rounded ${s.status === 'accepted' ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} onClick={() => updateSuggestionStatus(gi, s.status === 'accepted' ? '' : 'accepted')}>采纳</button>
                        <button className={`text-xs px-2 py-0.5 rounded ${s.status === 'rejected' ? 'bg-red-100 text-red-600 font-medium' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`} onClick={() => updateSuggestionStatus(gi, s.status === 'rejected' ? '' : 'rejected')}>拒绝</button>
                        <button className={`text-xs px-2 py-0.5 rounded ${s.status === 'deferred' ? 'bg-amber-100 text-amber-700 font-medium' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`} onClick={() => updateSuggestionStatus(gi, s.status === 'deferred' ? '' : 'deferred')}>搁置</button>
                        <span className="border-l border-gray-200 h-3 mx-1" />
                        {!isEditing ? (
                          <button className="text-xs text-gray-400 hover:text-indigo-500" onClick={() => { setEditingNote(gi); setNoteInput(s.note || ''); }}>
                            {s.note ? `备注: ${s.note.slice(0, 30)}${s.note.length > 30 ? '...' : ''}` : '+ 备注'}
                          </button>
                        ) : (
                          <div className="flex-1 flex items-center gap-1.5">
                            <Input size="mini" value={noteInput} onChange={setNoteInput} onPressEnter={() => saveNote(gi)} placeholder="记录进展..." autoFocus className="flex-1" />
                            <button className="text-xs text-indigo-500 hover:underline shrink-0" onClick={() => saveNote(gi)}>保存</button>
                            <button className="text-xs text-gray-400 hover:underline shrink-0" onClick={() => setEditingNote(null)}>取消</button>
                          </div>
                        )}
                        {s.statusUpdatedAt && !isEditing && (
                          <span className="text-xs text-gray-300 ml-auto">{new Date(s.statusUpdatedAt).toLocaleDateString('zh-CN')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          {groupedByLayer.length === 0 && (
            <Card className="shadow-sm">
              <Empty description={filterTag ? `没有匹配标签「${filterTag}」的建议` : '没有改进建议'} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
