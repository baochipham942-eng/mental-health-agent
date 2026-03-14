'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Tag, Empty, Button, Spin, Message, Select, Input, Tabs } from '@arco-design/web-react';
import { useRouter } from 'next/navigation';

/* ---------- Types ---------- */

interface EvalRun {
  runId: string;
  dataset: string;
  passRate: number;
  failCount: number;
}

interface OpenCodeItem {
  caseId: string;
  turnIndex: number;
  dimension: string;
  critique: string;
  tags: string[];
  userInput: string;
  aiReply: string;
}

interface Theme {
  id: string;
  name: string;
  description: string;
  tags: string[];
  failCount: number;
  dimensions: string[];
  suggestedAction: string;
}

interface Relationship {
  from: string;
  to: string;
  type: string;
  description: string;
}

import { DIM_LABELS } from '@/lib/eval/constants';

const REL_TYPE_LABELS: Record<string, string> = {
  causes: '导致',
  'co-occurs': '共现',
  hierarchy: '包含',
};

/* ---------- Component ---------- */

export default function AnalysisPage() {
  const router = useRouter();

  // 实验选择
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('open');

  // 开放编码
  const [items, setItems] = useState<OpenCodeItem[]>([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editTagInput, setEditTagInput] = useState('');
  const [highlightedTag, setHighlightedTag] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // 主轴编码
  const [themes, setThemes] = useState<Theme[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [insights, setInsights] = useState('');
  const [axialLoading, setAxialLoading] = useState(false);
  const [clustering, setClustering] = useState(false);

  // case 列表容器 ref
  const caseListRef = useRef<HTMLDivElement>(null);
  // 每个 case item 的 ref
  const caseRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/eval/runs');
        if (res.ok) {
          const data = await res.json();
          setRuns(data.runs || []);
          const firstFail = (data.runs || []).find((r: EvalRun) => r.failCount > 0);
          if (firstFail) {
            setSelectedRun(firstFail.runId);
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    loadOpenCoding(selectedRun);
    loadAxialCoding(selectedRun);
  }, [selectedRun]);

  const loadOpenCoding = async (runId: string) => {
    setOpenLoading(true);
    setFilterTags([]);
    try {
      const res = await fetch(`/api/eval/coding?runId=${encodeURIComponent(runId)}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch { /* ignore */ }
    finally { setOpenLoading(false); }
  };

  const loadAxialCoding = async (runId: string) => {
    setAxialLoading(true);
    try {
      const res = await fetch(`/api/eval/coding/axial?runId=${encodeURIComponent(runId)}`);
      if (res.ok) {
        const data = await res.json();
        setThemes(data.themes || []);
        setRelationships(data.relationships || []);
        setInsights(data.insights || '');
      }
    } catch { /* ignore */ }
    finally { setAxialLoading(false); }
  };

  const generateTags = async () => {
    if (!selectedRun) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/eval/coding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', runId: selectedRun }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        Message.success(`已为 ${(data.items || []).length} 条失败案例生成标签`);
      } else {
        const err = await res.json();
        Message.error(err.error || '生成失败');
      }
    } catch { Message.error('请求失败'); }
    finally { setGenerating(false); }
  };

  const updateTag = async (idx: number, newTags: string[]) => {
    if (!selectedRun) return;
    const item = items[idx];
    const updated = [...items];
    updated[idx] = { ...item, tags: newTags };
    setItems(updated);

    await fetch('/api/eval/coding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update-tag',
        runId: selectedRun,
        caseId: item.caseId,
        turnIndex: item.turnIndex,
        dimension: item.dimension,
        tags: newTags,
      }),
    });
  };

  const addTag = (idx: number) => {
    if (!editTagInput.trim()) return;
    const item = items[idx];
    const newTags = [...(item.tags || []), editTagInput.trim()];
    updateTag(idx, newTags);
    setEditTagInput('');
    setEditingIdx(null);
  };

  const removeTag = (idx: number, tagIdx: number) => {
    const item = items[idx];
    const newTags = item.tags.filter((_, i) => i !== tagIdx);
    updateTag(idx, newTags);
  };

  const runClustering = async () => {
    if (!selectedRun) return;
    await fetch('/api/eval/coding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', runId: selectedRun, items }),
    });

    setClustering(true);
    try {
      const res = await fetch('/api/eval/coding/axial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cluster', runId: selectedRun }),
      });
      if (res.ok) {
        const data = await res.json();
        setThemes(data.themes || []);
        setRelationships(data.relationships || []);
        setInsights(data.insights || '');
        Message.success('主轴编码完成');
      } else {
        const err = await res.json();
        Message.error(err.error || '聚类失败');
      }
    } catch { Message.error('请求失败'); }
    finally { setClustering(false); }
  };

  // 统计标签频次
  const tagStats = (() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      for (const tag of item.tags || []) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  const hasOpenCoding = items.some(item => (item.tags || []).length > 0);

  // 过滤后的案例列表
  const filteredItems = filterTags.length > 0
    ? items.filter(item => (item.tags || []).some(t => filterTags.includes(t)))
    : items;

  // 点击标签定位到对应 case
  const scrollToTag = useCallback((tag: string) => {
    const idx = items.findIndex(item => (item.tags || []).includes(tag));
    if (idx < 0) return;
    setHighlightedTag(tag);
    const el = caseRefs.current.get(idx);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedTag(null), 2000);
    }
  }, [items]);

  // 主题下钻：切换到开放编码 Tab 并过滤关联案例
  const drillDownTheme = useCallback((theme: Theme) => {
    setFilterTags(theme.tags);
    setActiveTab('open');
  }, []);

  // 主轴编码中标签跳转到开放编码
  const jumpToTagFromAxial = useCallback((tag: string) => {
    setFilterTags([]);
    setActiveTab('open');
    setTimeout(() => scrollToTag(tag), 100);
  }, [scrollToTag]);

  // 跳转到实验详情页并打开用例弹窗
  const goToCaseDetail = (caseId: string) => {
    if (!selectedRun) return;
    router.push(`/dashboard/optimization/exp/${encodeURIComponent(selectedRun)}?openCase=${encodeURIComponent(caseId)}`);
  };

  // 判断某个 case 是否应该高亮
  const isCaseHighlighted = (item: OpenCodeItem) => {
    return highlightedTag ? (item.tags || []).includes(highlightedTag) : false;
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
                {r.failCount > 0 && <Tag color="red" size="small" className="ml-1">{r.failCount} 失败</Tag>}
              </Select.Option>
            ))}
          </Select>
        </div>
      </Card>

      {!selectedRun && (
        <Empty description="请先选择一个实验" />
      )}

      {selectedRun && (
        <Card className="shadow-sm">
          <Tabs activeTab={activeTab} onChange={setActiveTab}>
            {/* ===== 开放编码 Tab ===== */}
            <Tabs.TabPane key="open" title={
              <span className="flex items-center gap-1.5">
                开放编码
                <Tag color="orange" size="small">Open Coding</Tag>
                {items.length > 0 && (
                  <span className="text-xs text-gray-400 font-normal">
                    {filteredItems.length !== items.length
                      ? `${filteredItems.length}/${items.length} 案例`
                      : `${items.length} 案例`
                    } · {tagStats.length} 标签
                  </span>
                )}
              </span>
            }>
              <div className="space-y-4">
                {/* 操作栏 */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    逐条浏览失败案例，为每个失败贴上涌现标签。标签从数据中自然生长，不限于预设的 8 个评分维度。
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    loading={generating}
                    onClick={generateTags}
                    className="shrink-0 ml-3"
                  >
                    {hasOpenCoding ? '重新生成标签' : 'AI 生成标签'}
                  </Button>
                </div>

                {/* 过滤状态提示 */}
                {filterTags.length > 0 && (
                  <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-purple-600">按主题过滤中：</span>
                    {filterTags.map(tag => (
                      <Tag key={tag} size="small" color="purple">{tag}</Tag>
                    ))}
                    <Button size="mini" type="text" className="text-purple-500" onClick={() => setFilterTags([])}>
                      清除过滤
                    </Button>
                  </div>
                )}

                {/* 标签频次统计 */}
                {tagStats.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-400 font-medium mb-2">标签频次（点击定位到案例）</div>
                    <div className="flex flex-wrap gap-1.5">
                      {tagStats.map(([tag, count]) => (
                        <Tag
                          key={tag}
                          size="small"
                          color={highlightedTag === tag ? 'purple' : 'orangered'}
                          className="cursor-pointer hover:opacity-80"
                          onClick={() => scrollToTag(tag)}
                        >
                          {tag} ({count})
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}

                {/* 失败案例列表 */}
                <Spin loading={openLoading}>
                  <div ref={caseListRef} className="space-y-2 max-h-[600px] overflow-y-auto">
                    {filteredItems.map((item, idx) => {
                      const globalIdx = items.indexOf(item);
                      const isExpanded = expandedIdx === globalIdx;
                      return (
                        <div
                          key={`${item.caseId}-${item.turnIndex}-${item.dimension}`}
                          ref={el => { if (el) caseRefs.current.set(globalIdx, el); }}
                          className={`border rounded-lg p-3 transition-all duration-300 ${
                            isCaseHighlighted(item)
                              ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-300'
                              : 'border-gray-100 hover:border-gray-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* 左侧: 失败信息 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <a
                                  className="font-mono text-xs text-indigo-600 hover:underline cursor-pointer"
                                  onClick={() => goToCaseDetail(item.caseId)}
                                >
                                  {item.caseId}
                                </a>
                                <Tag size="small" color="gray">Turn {item.turnIndex}</Tag>
                                <Tag size="small" color="orangered">{DIM_LABELS[item.dimension] || item.dimension}</Tag>
                              </div>
                              <div className="text-xs text-red-500 mb-2">{item.critique}</div>
                              <div
                                className="grid grid-cols-2 gap-2 text-xs cursor-pointer"
                                onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
                              >
                                <div className="bg-blue-50 rounded p-1.5">
                                  <span className="text-blue-400 font-medium">用户: </span>
                                  <span className="text-gray-600">
                                    {isExpanded ? item.userInput : (
                                      <>{item.userInput.slice(0, 80)}{item.userInput.length > 80 ? '...' : ''}</>
                                    )}
                                  </span>
                                </div>
                                <div className="bg-gray-50 rounded p-1.5">
                                  <span className="text-gray-400 font-medium">AI: </span>
                                  <span className="text-gray-600">
                                    {isExpanded ? item.aiReply : (
                                      <>{item.aiReply.slice(0, 80)}{item.aiReply.length > 80 ? '...' : ''}</>
                                    )}
                                  </span>
                                </div>
                              </div>
                              {!isExpanded && (item.userInput.length > 80 || item.aiReply.length > 80) && (
                                <div className="text-xs text-indigo-400 mt-1 cursor-pointer" onClick={() => setExpandedIdx(globalIdx)}>
                                  点击展开完整内容
                                </div>
                              )}
                              {isExpanded && (
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs text-gray-400 cursor-pointer" onClick={() => setExpandedIdx(null)}>收起</span>
                                  <a className="text-xs text-indigo-500 hover:underline cursor-pointer" onClick={() => goToCaseDetail(item.caseId)}>
                                    查看完整用例详情 →
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* 右侧: 标签 */}
                            <div className="w-48 shrink-0">
                              <div className="flex flex-wrap gap-1 mb-1.5">
                                {(item.tags || []).map((tag, tagIdx) => (
                                  <Tag key={tagIdx} size="small" color="purple" closable
                                    onClose={() => removeTag(globalIdx, tagIdx)}
                                  >
                                    {tag}
                                  </Tag>
                                ))}
                              </div>
                              {editingIdx === globalIdx ? (
                                <div className="flex gap-1">
                                  <Input
                                    size="mini"
                                    value={editTagInput}
                                    onChange={v => setEditTagInput(v)}
                                    onPressEnter={() => addTag(globalIdx)}
                                    placeholder="输入标签..."
                                    autoFocus
                                  />
                                  <Button size="mini" type="text" onClick={() => { setEditingIdx(null); setEditTagInput(''); }}>
                                    取消
                                  </Button>
                                </div>
                              ) : (
                                <Button size="mini" type="text" className="text-xs"
                                  onClick={() => { setEditingIdx(globalIdx); setEditTagInput(''); }}
                                >
                                  + 添加标签
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredItems.length === 0 && !openLoading && (
                      <Empty description={filterTags.length > 0 ? '没有匹配的案例' : '没有失败案例'} />
                    )}
                  </div>
                </Spin>
              </div>
            </Tabs.TabPane>

            {/* ===== 主轴编码 Tab ===== */}
            <Tabs.TabPane key="axial" title={
              <span className="flex items-center gap-1.5">
                主轴编码
                <Tag color="red" size="small">Axial Coding</Tag>
                {themes.length > 0 && (
                  <span className="text-xs text-gray-400 font-normal">{themes.length} 个主题</span>
                )}
              </span>
            }>
              <div className="space-y-4">
                {/* 操作栏 */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    将开放编码产生的标签聚类为上位主题，分析主题间的关系和共现模式，生成结构化改进洞察。
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    loading={clustering}
                    onClick={runClustering}
                    disabled={!hasOpenCoding}
                    className="shrink-0 ml-3"
                  >
                    {themes.length > 0 ? '重新聚类' : 'AI 聚类标签'}
                  </Button>
                </div>

                {!hasOpenCoding && (
                  <Empty description="请先完成开放编码（生成标签）后再进行主轴编码" />
                )}

                <Spin loading={axialLoading}>
                  {themes.length > 0 && (
                    <div className="space-y-4">
                      {/* 主题卡片 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {themes.map(theme => (
                          <div
                            key={theme.id}
                            className="border rounded-lg p-3 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                            onClick={() => drillDownTheme(theme)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-gray-900">{theme.name}</span>
                                <Tag size="small" color="red">{theme.failCount} 例</Tag>
                              </div>
                              <span className="text-xs text-indigo-400">点击查看关联案例 →</span>
                            </div>
                            <div className="text-xs text-gray-500 mb-2">{theme.description}</div>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {theme.tags.map(tag => (
                                <Tag
                                  key={tag}
                                  size="small"
                                  color="purple"
                                  className="cursor-pointer hover:opacity-80"
                                  onClick={(e) => { e.stopPropagation(); jumpToTagFromAxial(tag); }}
                                >
                                  {tag}
                                </Tag>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {theme.dimensions.map(d => (
                                <Tag key={d} size="small" color="arcoblue">{DIM_LABELS[d] || d}</Tag>
                              ))}
                            </div>
                            <div className="text-xs text-green-700 bg-green-50 rounded p-1.5">
                              {theme.suggestedAction}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 主题关系 */}
                      {relationships.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-xs text-gray-400 font-medium mb-2">主题关系</div>
                          <div className="space-y-1">
                            {relationships.map((rel, i) => {
                              const fromTheme = themes.find(t => t.id === rel.from);
                              const toTheme = themes.find(t => t.id === rel.to);
                              return (
                                <div key={i} className="text-xs text-gray-600 flex items-center gap-1.5">
                                  <Tag size="small" color="red">{fromTheme?.name || rel.from}</Tag>
                                  <span className="text-gray-400">→ {REL_TYPE_LABELS[rel.type] || rel.type} →</span>
                                  <Tag size="small" color="red">{toTheme?.name || rel.to}</Tag>
                                  <span className="text-gray-400 ml-1">{rel.description}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 洞察报告 */}
                      {insights && (
                        <div className="bg-indigo-50 rounded-lg p-4">
                          <div className="text-xs text-indigo-400 font-medium mb-2">结构化改进洞察</div>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">{insights}</div>
                        </div>
                      )}
                    </div>
                  )}
                </Spin>
              </div>
            </Tabs.TabPane>
          </Tabs>
        </Card>
      )}
    </div>
  );
}
