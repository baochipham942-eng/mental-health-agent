'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Card, Button, Space, Statistic, Badge, Message, Grid,
} from '@arco-design/web-react';
import {
  IconExclamationCircle, IconCheck,
} from '@arco-design/web-react/icon';

const { Row, Col } = Grid;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface SecurityEventItem {
  id: string;
  conversationId: string | null;
  eventType: string;
  severity: string;
  description: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface LowScoreAlertItem {
  conversationId: string;
  dimension: 'legal' | 'ethical';
  score: number;
  evaluatedAt: string;
}

interface SafetyMetricsData {
  safetyScore: number;
  crisisRate: number;
  guardrailTriggerRate: number;
  avgLegalScore: number;
  avgEthicalScore: number;
  trend: 'improving' | 'stable' | 'degrading';
}

interface MetricsData {
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  unresolvedCount: number;
  resolvedCount: number;
}

interface DashboardData {
  metrics: MetricsData;
  safetyMetrics: SafetyMetricsData;
  events: SecurityEventItem[];
  lowScoreAlerts: LowScoreAlertItem[];
}

// --------------------------------------------------------------------------
// 常量
// --------------------------------------------------------------------------

const SEVERITY_COLOR: Record<string, string> = {
  LOW: 'green',
  MEDIUM: 'orangered',
  HIGH: 'red',
  CRITICAL: 'magenta',
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  CRISIS_DETECTED: '危机检测',
  GUARDRAIL_TRIGGERED: '护栏触发',
  LOW_LEGAL_SCORE: '合规低分',
  LOW_ETHICAL_SCORE: '伦理低分',
  CONTENT_VIOLATION: '内容违规',
};

const DIMENSION_LABEL: Record<string, string> = {
  legal: '合规',
  ethical: '伦理',
};

const TREND_LABEL: Record<string, { text: string; color: string }> = {
  improving: { text: '改善中', color: '#52c41a' },
  stable: { text: '稳定', color: '#faad14' },
  degrading: { text: '恶化中', color: '#f5222d' },
};

// --------------------------------------------------------------------------
// 页面
// --------------------------------------------------------------------------

export default function SecurityDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/eval/security?days=${days}`);
      if (!res.ok) throw new Error('请求失败');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('加载安全数据失败:', e);
      Message.error('加载安全数据失败');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResolve = async (eventId: string) => {
    setResolvingId(eventId);
    try {
      const res = await fetch(`/api/eval/security/${eventId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: 'admin' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '操作失败');
      }
      Message.success('已标记为已解决');
      fetchData();
    } catch (e: any) {
      Message.error(e.message || '解决事件失败');
    } finally {
      setResolvingId(null);
    }
  };

  // 安全分颜色
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#f5222d';
  };

  const safetyMetrics = data?.safetyMetrics;
  const metrics = data?.metrics;

  // --------------------------------------------------------------------------
  // 事件表格列定义
  // --------------------------------------------------------------------------

  const eventColumns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (val: string) => new Date(val).toLocaleString('zh-CN'),
    },
    {
      title: '类型',
      dataIndex: 'eventType',
      width: 120,
      render: (val: string) => (
        <Tag>{EVENT_TYPE_LABEL[val] || val}</Tag>
      ),
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      width: 100,
      render: (val: string) => (
        <Tag color={SEVERITY_COLOR[val] || 'gray'}>{val}</Tag>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: '对话 ID',
      dataIndex: 'conversationId',
      width: 140,
      ellipsis: true,
      render: (val: string | null) => val ? (
        <span className="font-mono text-xs">{val.slice(0, 12)}...</span>
      ) : '-',
    },
    {
      title: '状态',
      dataIndex: 'resolved',
      width: 90,
      render: (val: boolean) => val ? (
        <Badge status="success" text="已解决" />
      ) : (
        <Badge status="error" text="待处理" />
      ),
    },
    {
      title: '操作',
      width: 110,
      dataIndex: 'id',
      render: (id: string, record: SecurityEventItem) => {
        if (record.resolved) {
          return <span className="text-gray-400 text-xs">已解决</span>;
        }
        return (
          <Button
            type="primary"
            size="mini"
            icon={<IconCheck />}
            loading={resolvingId === id}
            onClick={() => handleResolve(id)}
          >
            解决
          </Button>
        );
      },
    },
  ];

  // --------------------------------------------------------------------------
  // 低分预警列定义
  // --------------------------------------------------------------------------

  const alertColumns = [
    {
      title: '对话 ID',
      dataIndex: 'conversationId',
      ellipsis: true,
      render: (val: string) => (
        <span className="font-mono text-xs">{val}</span>
      ),
    },
    {
      title: '维度',
      dataIndex: 'dimension',
      width: 100,
      render: (val: string) => (
        <Tag color={val === 'legal' ? 'orange' : 'purple'}>
          {DIMENSION_LABEL[val] || val}
        </Tag>
      ),
    },
    {
      title: '分数',
      dataIndex: 'score',
      width: 80,
      render: (val: number) => (
        <span className="font-mono" style={{ color: val <= 2 ? '#f5222d' : '#faad14' }}>
          {val}/10
        </span>
      ),
    },
    {
      title: '评估时间',
      dataIndex: 'evaluatedAt',
      width: 160,
      render: (val: string) => new Date(val).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <IconExclamationCircle style={{ color: '#f5222d' }} />
            安全红线看板
          </h2>
          <p className="text-sm text-gray-500">追踪危机事件、安全违规与低分预警</p>
        </div>
        <Space>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-md px-2 py-1"
          >
            <option value={7}>近 7 天</option>
            <option value={14}>近 14 天</option>
            <option value={30}>近 30 天</option>
          </select>
          <Button type="outline" onClick={fetchData} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {loading && !data ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : data ? (
        <>
          {/* 顶部指标卡 */}
          <Row gutter={16}>
            <Col span={6}>
              <Card hoverable>
                <Statistic
                  title="综合安全分"
                  value={safetyMetrics?.safetyScore ?? 0}
                  suffix="/100"
                  styleValue={{
                    color: getScoreColor(safetyMetrics?.safetyScore ?? 0),
                    fontWeight: 700,
                  }}
                  extra={safetyMetrics?.trend ? (
                    <span style={{ color: TREND_LABEL[safetyMetrics.trend]?.color, fontSize: 12 }}>
                      {TREND_LABEL[safetyMetrics.trend]?.text}
                    </span>
                  ) : undefined}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card hoverable>
                <Statistic
                  title="未解决事件"
                  value={metrics?.unresolvedCount ?? 0}
                  styleValue={{
                    color: (metrics?.unresolvedCount ?? 0) > 0 ? '#f5222d' : '#52c41a',
                    fontWeight: 700,
                  }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card hoverable>
                <Statistic
                  title={`近 ${days} 天危机事件`}
                  value={metrics?.byType?.['CRISIS_DETECTED'] ?? 0}
                  styleValue={{
                    color: (metrics?.byType?.['CRISIS_DETECTED'] ?? 0) > 0 ? '#f5222d' : '#52c41a',
                    fontWeight: 700,
                  }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card hoverable>
                <Statistic
                  title="平均合规/伦理分"
                  value={`${safetyMetrics?.avgLegalScore ?? '-'} / ${safetyMetrics?.avgEthicalScore ?? '-'}`}
                  styleValue={{ fontWeight: 700 }}
                />
              </Card>
            </Col>
          </Row>

          {/* 事件列表 */}
          <Card
            title={
              <span className="flex items-center gap-2">
                安全事件
                <Tag color="gray">{data.events.length} 条</Tag>
              </span>
            }
          >
            <Table
              columns={eventColumns}
              data={data.events}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              noDataElement={
                <div className="py-8 text-gray-400 text-center">暂无安全事件记录</div>
              }
              stripe
              size="small"
            />
          </Card>

          {/* 低分预警区域 */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <IconExclamationCircle style={{ color: '#faad14' }} />
                低分预警
                <Tag color="orange">{data.lowScoreAlerts.length} 条</Tag>
              </span>
            }
          >
            <Table
              columns={alertColumns}
              data={data.lowScoreAlerts}
              rowKey={(record: LowScoreAlertItem) => `${record.conversationId}-${record.dimension}`}
              pagination={{ pageSize: 10 }}
              noDataElement={
                <div className="py-8 text-gray-400 text-center">暂无低分预警</div>
              }
              stripe
              size="small"
            />
          </Card>
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">加载失败，请刷新重试</div>
      )}
    </div>
  );
}
