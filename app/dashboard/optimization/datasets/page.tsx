'use client';

import { useState, useEffect } from 'react';
import { Card, Tag, Table, Spin, Empty, Modal, Pagination, Button } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';

interface DatasetInfo {
  id: string;
  name: string;
  language: string;
  source_url: string;
  total_cases: number;
  caseCount: number;
  imported_at: string;
}

interface CaseItem {
  id: string;
  dataset_id: string;
  category: string | null;
  emotion_type: string | null;
  situation: string | null;
  turn_count: number;
  first_role?: string | null;
  first_prompt?: string | null;
}

interface DialogTurn {
  role: 'user' | 'assistant';
  content: string;
  strategy?: string;
  emotion?: string;
}

interface CaseDetail extends CaseItem {
  dialog: DialogTurn[];
  psychotherapy: string | null;
  metadata: any;
}

const LANG_MAP: Record<string, string> = { zh: '中文', en: '英文', 'zh+en': '中英双语' };

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDs, setSelectedDs] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Case detail modal
  const [detailVisible, setDetailVisible] = useState(false);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { loadDatasets(); }, []);

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/eval/datasets');
      if (res.ok) {
        const list = (await res.json()).datasets as DatasetInfo[];
        setDatasets(list);
        // 默认选中第一个数据集
        if (list.length > 0 && !selectedDs) {
          loadCases(list[0].id);
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const loadCases = async (dsId: string, p = 1) => {
    setSelectedDs(dsId);
    setPage(p);
    setCasesLoading(true);
    try {
      const res = await fetch(`/api/eval/datasets?dataset=${dsId}&page=${p}&pageSize=30`);
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases);
        setTotal(data.total);
      }
    } catch { /* ignore */ }
    finally { setCasesLoading(false); }
  };

  const viewCase = async (caseId: string) => {
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/eval/datasets/${encodeURIComponent(caseId)}`);
      if (res.ok) setCaseDetail(await res.json());
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  };

  // 根据当前数据集的数据动态生成列（只显示有数据的字段）
  const caseColumns: ColumnProps<CaseItem>[] = (() => {
    const cols: ColumnProps<CaseItem>[] = [
      {
        title: 'ID', dataIndex: 'id', width: 150,
        render: (v: string) => (
          <a onClick={() => viewCase(v)} className="text-indigo-600 hover:underline cursor-pointer font-mono text-xs">{v}</a>
        ),
      },
    ];
    if (cases.some(c => c.category)) {
      cols.push({ title: '分类', dataIndex: 'category', width: 160, render: (v: string | null) => v || '—' });
    }
    if (cases.some(c => c.emotion_type)) {
      cols.push({ title: '情绪类型', dataIndex: 'emotion_type', width: 140, render: (v: string | null) => v ? <Tag size="small">{v}</Tag> : '—' });
    }
    if (cases.some(c => c.situation)) {
      cols.push({ title: '场景', dataIndex: 'situation', ellipsis: true, render: (v: string | null) => v || '—' });
    }
    // 首轮提示词（situation 为空时 fallback 到 first_prompt）
    if (cases.some(c => !c.situation && c.first_prompt)) {
      cols.push({
        title: '首轮提示词', dataIndex: 'first_prompt', ellipsis: true,
        render: (_v: string | null, record: CaseItem) => {
          const text = record.situation || record.first_prompt;
          return text ? <span className="text-xs text-gray-600">{text}</span> : '—';
        },
      });
    }
    cols.push({ title: '轮次', dataIndex: 'turn_count', width: 60, align: 'center' as const });
    return cols;
  })();

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* 数据集概览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Spin loading={loading} className="col-span-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {datasets.map(ds => (
              <Card
                key={ds.id}
                className={`shadow-sm cursor-pointer transition-all hover:shadow-md ${selectedDs === ds.id ? 'ring-2 ring-indigo-300' : ''}`}
                onClick={() => loadCases(ds.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">{ds.name || ds.id}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Tag size="small" color="arcoblue">{LANG_MAP[ds.language] || ds.language}</Tag>
                      <span className="text-sm text-gray-500">{ds.caseCount || ds.total_cases} 条用例</span>
                    </div>
                  </div>
                </div>
                {ds.imported_at && (
                  <div className="text-xs text-gray-400 mt-2">导入于 {ds.imported_at}</div>
                )}
              </Card>
            ))}
            {datasets.length === 0 && !loading && (
              <div className="col-span-3">
                <Empty description="暂无数据集，请先运行 bun eval:prepare" />
              </div>
            )}
          </div>
        </Spin>
      </div>

      {/* 用例列表 */}
      {selectedDs && (
        <Card className="shadow-sm" title={
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base">用例列表</span>
            <Tag color="arcoblue" size="small">{selectedDs}</Tag>
            <span className="text-sm text-gray-400">共 {total} 条</span>
          </div>
        }>
          <Table
            columns={caseColumns}
            data={cases}
            rowKey="id"
            loading={casesLoading}
            pagination={false}
            size="small"
          />
          {total > 30 && (
            <div className="flex justify-center mt-4">
              <Pagination current={page} total={total} pageSize={30} onChange={p => loadCases(selectedDs, p)} />
            </div>
          )}
        </Card>
      )}

      {/* 用例详情弹窗 */}
      <Modal
        title={caseDetail ? `用例详情 — ${caseDetail.id}` : '用例详情'}
        visible={detailVisible}
        onCancel={() => { setDetailVisible(false); setCaseDetail(null); }}
        footer={<Button onClick={() => { setDetailVisible(false); setCaseDetail(null); }}>关闭</Button>}
        style={{ width: 720, maxWidth: '95vw' }}
      >
        <Spin loading={detailLoading}>
          {caseDetail && (
            <div className="space-y-3">
              {/* 元信息 */}
              <div className="flex flex-wrap gap-2">
                {caseDetail.category && <Tag color="arcoblue">{caseDetail.category}</Tag>}
                {caseDetail.emotion_type && <Tag color="purple">{caseDetail.emotion_type}</Tag>}
                {caseDetail.psychotherapy && <Tag color="green">{caseDetail.psychotherapy}</Tag>}
                <Tag>{caseDetail.turn_count} 轮对话</Tag>
              </div>
              {caseDetail.situation && (
                <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">{caseDetail.situation}</div>
              )}
              {/* 对话内容 */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {caseDetail.dialog.map((turn, i) => (
                  <div key={i} className={`rounded p-2.5 ${turn.role === 'user' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${turn.role === 'user' ? 'text-blue-500' : 'text-gray-500'}`}>
                        {turn.role === 'user' ? '用户' : '咨询师'}
                      </span>
                      {turn.strategy && <Tag size="small" color="purple">{turn.strategy}</Tag>}
                      {turn.emotion && <Tag size="small" color="orange">{turn.emotion}</Tag>}
                    </div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{turn.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
