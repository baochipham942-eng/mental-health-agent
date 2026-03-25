'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Empty, Spin } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';

// --------------------------------------------------------------------------
// Types（与 agreement-stats.ts 对齐）
// --------------------------------------------------------------------------

interface DimensionStats {
  count: number;
  agreementRate: number;
  kappa: number;
  pearson: number;
  rmse: number;
  avgLlmScore: number;
  avgHumanScore: number;
  bias: number;
}

interface AgreementAnalysis {
  totalPairs: number;
  agreementRate: number;
  cohensKappa: number;
  pearsonCorrelation: number;
  rmse: number;
  byDimension: Record<string, DimensionStats>;
  interpretation: string;
}

// --------------------------------------------------------------------------
// 维度中文名
// --------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  legal: '合规性',
  ethical: '伦理性',
  professional: '专业性',
  ux: '用户体验',
};

// --------------------------------------------------------------------------
// 颜色工具
// --------------------------------------------------------------------------

function kappaColor(kappa: number): string {
  if (kappa > 0.8) return '#00b42a';
  if (kappa > 0.6) return '#165dff';
  if (kappa > 0.4) return '#ff7d00';
  return '#f53f3f';
}

function kappaLevel(kappa: number): string {
  if (kappa > 0.8) return '优秀';
  if (kappa > 0.6) return '较好';
  if (kappa > 0.4) return '中等';
  if (kappa > 0.2) return '一般';
  return '较差';
}

// --------------------------------------------------------------------------
// 散点图（纯 SVG）
// --------------------------------------------------------------------------

const SCATTER_COLORS: Record<string, string> = {
  legal: '#165dff',
  ethical: '#00b42a',
  professional: '#ff7d00',
  ux: '#722ed1',
};

interface ScatterPoint {
  dimension: string;
  avgLlm: number;
  avgHuman: number;
}

function ScatterPlot({ data }: { data: AgreementAnalysis }) {
  const W = 400;
  const H = 400;
  const pad = 50;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  // 收集所有维度的散点（每个维度一个点：均分对）
  const points: ScatterPoint[] = Object.entries(data.byDimension).map(([dim, stats]) => ({
    dimension: dim,
    avgLlm: stats.avgLlmScore,
    avgHuman: stats.avgHumanScore,
  }));

  // 坐标范围固定 0-10
  const scale = (val: number) => (val / 10) * innerW;

  return (
    <svg width={W} height={H} className="mx-auto">
      {/* 背景 */}
      <rect x={pad} y={pad} width={innerW} height={innerH} fill="#fafafa" stroke="#e5e6eb" />

      {/* 网格线 */}
      {[0, 2, 4, 6, 8, 10].map(v => (
        <g key={v}>
          <line
            x1={pad}
            y1={pad + innerH - scale(v)}
            x2={pad + innerW}
            y2={pad + innerH - scale(v)}
            stroke="#f2f3f5"
            strokeDasharray="3,3"
          />
          <line
            x1={pad + scale(v)}
            y1={pad}
            x2={pad + scale(v)}
            y2={pad + innerH}
            stroke="#f2f3f5"
            strokeDasharray="3,3"
          />
          <text x={pad - 8} y={pad + innerH - scale(v) + 4} textAnchor="end" fontSize={10} fill="#86909c">
            {v}
          </text>
          <text x={pad + scale(v)} y={pad + innerH + 16} textAnchor="middle" fontSize={10} fill="#86909c">
            {v}
          </text>
        </g>
      ))}

      {/* 对角线（完美一致线） */}
      <line
        x1={pad}
        y1={pad + innerH}
        x2={pad + innerW}
        y2={pad}
        stroke="#c9cdd4"
        strokeWidth={1}
        strokeDasharray="6,4"
      />

      {/* 散点 */}
      {points.map(p => (
        <g key={p.dimension}>
          <circle
            cx={pad + scale(p.avgLlm)}
            cy={pad + innerH - scale(p.avgHuman)}
            r={8}
            fill={SCATTER_COLORS[p.dimension] || '#86909c'}
            opacity={0.8}
          />
          <title>{`${DIMENSION_LABELS[p.dimension] || p.dimension}: LLM=${p.avgLlm}, 人工=${p.avgHuman}`}</title>
        </g>
      ))}

      {/* 轴标签 */}
      <text x={pad + innerW / 2} y={H - 4} textAnchor="middle" fontSize={12} fill="#4e5969">
        LLM 评分
      </text>
      <text
        x={12}
        y={pad + innerH / 2}
        textAnchor="middle"
        fontSize={12}
        fill="#4e5969"
        transform={`rotate(-90, 12, ${pad + innerH / 2})`}
      >
        人工评分
      </text>

      {/* 图例 */}
      {Object.entries(SCATTER_COLORS).map(([dim, color], i) => (
        <g key={dim} transform={`translate(${pad + 8}, ${pad + 8 + i * 18})`}>
          <circle cx={6} cy={6} r={5} fill={color} opacity={0.8} />
          <text x={16} y={10} fontSize={11} fill="#4e5969">{DIMENSION_LABELS[dim] || dim}</text>
        </g>
      ))}
    </svg>
  );
}

// --------------------------------------------------------------------------
// 页面主体
// --------------------------------------------------------------------------

export default function AgreementPage() {
  const [data, setData] = useState<AgreementAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/eval/agreement');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `请求失败 (${res.status})`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Spin size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Card>
          <div className="text-center py-10 text-red-500">
            加载失败：{error}
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // 数据不足提示
  const insufficientData = data.totalPairs < 10;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">人机一致性分析</h2>
        <p className="text-sm text-gray-500 mt-1">
          LLM 自动评分与人工标注的一致性指标（Cohen&apos;s Kappa + Pearson 相关系数）
        </p>
      </div>

      {/* 数据不足提示 */}
      {insufficientData && (
        <Card className="border-orange-200 bg-orange-50">
          <div className="flex items-start gap-3">
            <span className="text-orange-500 text-xl leading-none">!</span>
            <div>
              <div className="font-medium text-orange-700">标注数据不足</div>
              <div className="text-sm text-orange-600 mt-1">
                当前仅有 {data.totalPairs} 对标注数据，需要至少 10 对才能进行有意义的一致性分析。
                请前往评测详情页进行更多人工标注。
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 顶部指标卡片（4 列） */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Cohen's Kappa"
          value={data.cohensKappa.toFixed(3)}
          subtitle={kappaLevel(data.cohensKappa)}
          color={kappaColor(data.cohensKappa)}
        />
        <MetricCard
          label="Pearson 相关系数"
          value={data.pearsonCorrelation.toFixed(3)}
          subtitle={data.pearsonCorrelation > 0.7 ? '强相关' : data.pearsonCorrelation > 0.4 ? '中等相关' : '弱相关'}
          color={data.pearsonCorrelation > 0.7 ? '#00b42a' : data.pearsonCorrelation > 0.4 ? '#ff7d00' : '#f53f3f'}
        />
        <MetricCard
          label="一致率"
          value={`${(data.agreementRate * 100).toFixed(1)}%`}
          subtitle={`${data.totalPairs} 对标注`}
          color={data.agreementRate > 0.8 ? '#00b42a' : data.agreementRate > 0.6 ? '#165dff' : '#ff7d00'}
        />
        <MetricCard
          label="RMSE"
          value={data.rmse.toFixed(2)}
          subtitle={data.rmse < 1 ? '误差小' : data.rmse < 2 ? '误差适中' : '误差较大'}
          color={data.rmse < 1 ? '#00b42a' : data.rmse < 2 ? '#ff7d00' : '#f53f3f'}
        />
      </div>

      {/* 解读文字 */}
      {data.interpretation && (
        <Card className="bg-blue-50 border-blue-200">
          <div className="text-sm text-blue-800">{data.interpretation}</div>
        </Card>
      )}

      {/* 分维度对比表格 + 散点图 */}
      <div className="grid grid-cols-3 gap-6">
        {/* 表格（占 2 列） */}
        <div className="col-span-2">
          <Card title="分维度对比">
            {Object.keys(data.byDimension).length === 0 ? (
              <Empty description="暂无分维度数据" />
            ) : (
              <DimensionTable byDimension={data.byDimension} />
            )}
          </Card>
        </div>

        {/* 散点图（占 1 列） */}
        <div className="col-span-1">
          <Card title="LLM vs 人工评分">
            {Object.keys(data.byDimension).length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              <ScatterPlot data={data} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 子组件
// --------------------------------------------------------------------------

function MetricCard({ label, value, subtitle, color }: {
  label: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color }}>{value}</div>
      <div className="text-xs mt-1" style={{ color, opacity: 0.7 }}>{subtitle}</div>
    </div>
  );
}

interface DimensionTableRow {
  key: string;
  dimension: string;
  dimensionLabel: string;
  count: number;
  agreementRate: number;
  kappa: number;
  pearson: number;
  rmse: number;
  avgLlmScore: number;
  avgHumanScore: number;
  bias: number;
}

function DimensionTable({ byDimension }: { byDimension: Record<string, DimensionStats> }) {
  const rows: DimensionTableRow[] = Object.entries(byDimension).map(([dim, stats]) => ({
    key: dim,
    dimension: dim,
    dimensionLabel: DIMENSION_LABELS[dim] || dim,
    ...stats,
  }));

  const columns: ColumnProps<DimensionTableRow>[] = [
    {
      title: '维度',
      dataIndex: 'dimensionLabel',
      width: 90,
    },
    {
      title: '标注数',
      dataIndex: 'count',
      width: 70,
      align: 'center' as const,
    },
    {
      title: '一致率',
      dataIndex: 'agreementRate',
      width: 80,
      align: 'center' as const,
      render: (val: number) => `${(val * 100).toFixed(0)}%`,
    },
    {
      title: 'Kappa',
      dataIndex: 'kappa',
      width: 80,
      align: 'center' as const,
      render: (val: number) => (
        <span style={{ color: kappaColor(val), fontWeight: 600 }}>{val.toFixed(2)}</span>
      ),
    },
    {
      title: 'Pearson',
      dataIndex: 'pearson',
      width: 80,
      align: 'center' as const,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: 'RMSE',
      dataIndex: 'rmse',
      width: 70,
      align: 'center' as const,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: 'LLM 均分',
      dataIndex: 'avgLlmScore',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '人工均分',
      dataIndex: 'avgHumanScore',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '偏差',
      dataIndex: 'bias',
      width: 80,
      align: 'center' as const,
      render: (val: number) => {
        if (Math.abs(val) < 0.01) {
          return <span className="text-gray-400">0</span>;
        }
        if (val > 0) {
          return (
            <Tag color="red" size="small">
              +{val.toFixed(1)} ↑
            </Tag>
          );
        }
        return (
          <Tag color="blue" size="small">
            {val.toFixed(1)} ↓
          </Tag>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      pagination={false}
      size="small"
      border={false}
    />
  );
}
