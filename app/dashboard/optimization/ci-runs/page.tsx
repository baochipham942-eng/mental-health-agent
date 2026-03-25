'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Table, Tag, Card, Select, Empty, Spin } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';

interface CIRunRow {
  id: string;
  promptVersionId: string;
  promptName: string;
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';
  totalCases: number;
  passedCases: number;
  failedCases: number;
  avgScore: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'gray',
  RUNNING: 'blue',
  PASSED: 'green',
  FAILED: 'red',
  SKIPPED: 'orange',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: '等待中',
  RUNNING: '运行中',
  PASSED: '通过',
  FAILED: '失败',
  SKIPPED: '跳过',
};

export default function CIRunsPage() {
  const [runs, setRuns] = useState<CIRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/eval/ci-runs?limit=100');
        if (!res.ok) throw new Error('请求失败');
        const data = await res.json();
        setRuns(data.runs || []);
      } catch (e) {
        console.error('加载 CI Runs 失败:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredRuns = useMemo(() => {
    if (!statusFilter) return runs;
    return runs.filter(r => r.status === statusFilter);
  }, [runs, statusFilter]);

  const columns: ColumnProps<CIRunRow>[] = [
    {
      title: 'Prompt 名称',
      dataIndex: 'promptName',
      width: 200,
      render: (_, record) => (
        <span className="font-medium text-gray-800">{record.promptName}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (_, record) => (
        <Tag color={STATUS_COLOR[record.status] || 'gray'}>
          {STATUS_LABEL[record.status] || record.status}
        </Tag>
      ),
    },
    {
      title: '通过率',
      dataIndex: 'passedCases',
      width: 120,
      render: (_, record) => {
        if (record.totalCases === 0) return <span className="text-gray-400">-</span>;
        const rate = ((record.passedCases / record.totalCases) * 100).toFixed(1);
        return (
          <span>
            {record.passedCases}/{record.totalCases}
            <span className="text-gray-400 ml-1">({rate}%)</span>
          </span>
        );
      },
    },
    {
      title: '平均分',
      dataIndex: 'avgScore',
      width: 80,
      render: (_, record) => (
        <span className="font-mono">
          {record.avgScore !== null ? record.avgScore.toFixed(1) : '-'}
        </span>
      ),
    },
    {
      title: '版本 ID',
      dataIndex: 'promptVersionId',
      width: 120,
      render: (_, record) => (
        <span className="font-mono text-xs text-gray-500">
          {record.promptVersionId.slice(0, 8)}...
        </span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (_, record) => (
        <span className="text-gray-500 text-xs">
          {new Date(record.createdAt).toLocaleString('zh-CN')}
        </span>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'finishedAt',
      width: 100,
      render: (_, record) => {
        if (!record.startedAt || !record.finishedAt) return <span className="text-gray-400">-</span>;
        const ms = new Date(record.finishedAt).getTime() - new Date(record.startedAt).getTime();
        const sec = (ms / 1000).toFixed(1);
        return <span className="text-xs text-gray-500">{sec}s</span>;
      },
    },
  ];

  // 统计信息
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of runs) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  }, [runs]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Prompt CI Runs</h2>
        <p className="text-sm text-gray-500">Prompt 版本注册后自动触发的评测运行记录</p>
      </div>

      {/* 状态统计卡片 */}
      <div className="flex gap-3">
        {(['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED'] as const).map(status => (
          <Card
            key={status}
            size="small"
            className="flex-1 cursor-pointer hover:shadow-sm transition-shadow"
            style={{
              borderColor: statusFilter === status ? STATUS_COLOR[status] : undefined,
              borderWidth: statusFilter === status ? 2 : 1,
            }}
            onClick={() => setStatusFilter(statusFilter === status ? undefined : status)}
          >
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: `var(--color-${STATUS_COLOR[status]}-6, #666)` }}>
                {statusCounts[status] || 0}
              </div>
              <div className="text-xs text-gray-500">{STATUS_LABEL[status]}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <Select
          placeholder="按状态筛选"
          allowClear
          value={statusFilter}
          onChange={(val) => setStatusFilter(val || undefined)}
          style={{ width: 160 }}
        >
          {(['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED'] as const).map(s => (
            <Select.Option key={s} value={s}>
              {STATUS_LABEL[s]}
            </Select.Option>
          ))}
        </Select>
        <span className="text-sm text-gray-400">
          共 {filteredRuns.length} 条记录
        </span>
      </div>

      {/* 数据表格 */}
      {loading ? (
        <div className="text-center py-20">
          <Spin size={32} />
        </div>
      ) : runs.length === 0 ? (
        <Empty description="暂无 CI Run 记录。注册新 Prompt 版本后将自动创建。" />
      ) : (
        <Table
          columns={columns}
          data={filteredRuns}
          rowKey="id"
          pagination={{ pageSize: 20, showTotal: true }}
          size="small"
          stripe
          expandedRowRender={(record) => record.errorMessage ? (
            <div className="px-4 py-2 text-xs text-red-600 bg-red-50 rounded">
              <span className="font-medium">错误信息：</span>{record.errorMessage}
            </div>
          ) : null}
        />
      )}
    </div>
  );
}
