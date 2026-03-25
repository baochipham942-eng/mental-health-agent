'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Card, Button, Space, Statistic, Message, Grid, Pagination } from '@arco-design/web-react';
import { IconPlus, IconPlayArrow, IconSkipNext } from '@arco-design/web-react/icon';
import type { ColumnProps } from '@arco-design/web-react/es/Table';

const { Row, Col } = Grid;

// --------------------------------------------------------------------------
// 类型
// --------------------------------------------------------------------------

interface AnnotationTask {
  id: string;
  evaluationId: string;
  conversationId: string;
  priority: number;
  status: string;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  skipped: number;
}

// --------------------------------------------------------------------------
// 优先级 & 状态配色
// --------------------------------------------------------------------------

const PRIORITY_MAP: Record<number, { text: string; color: string }> = {
  0: { text: '普通', color: 'gray' },
  1: { text: '高优', color: 'orange' },
  2: { text: '紧急', color: 'red' },
};

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待标注', color: 'gray' },
  IN_PROGRESS: { text: '进行中', color: 'blue' },
  COMPLETED: { text: '已完成', color: 'green' },
  SKIPPED: { text: '已跳过', color: '' },
};

// --------------------------------------------------------------------------
// 页面组件
// --------------------------------------------------------------------------

export default function AnnotationQueuePage() {
  const [tasks, setTasks] = useState<AnnotationTask[]>([]);
  const [stats, setStats] = useState<TaskStats>({ total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const pageSize = 20;

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/eval/annotation-tasks?${params}`);
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setTasks(data.tasks || []);
      setStats(data.stats || { total: 0, pending: 0, inProgress: 0, completed: 0, skipped: 0 });
    } catch (e) {
      Message.error('加载任务列表失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // 自动生成任务
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/eval/annotation-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', threshold: 5 }),
      });
      if (!res.ok) throw new Error('生成失败');
      const data = await res.json();
      Message.success(`已生成 ${data.created} 个标注任务`);
      fetchTasks();
    } catch (e) {
      Message.error('自动生成任务失败');
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  // 开始标注（跳转到工作台）
  const handleStartAnnotation = () => {
    window.location.href = '/dashboard/optimization/annotation-queue/workbench';
  };

  // 开始某个任务的标注
  const handleStartTask = async (task: AnnotationTask) => {
    try {
      await fetch(`/api/eval/annotation-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      window.location.href = `/dashboard/optimization/annotation-queue/workbench?taskId=${task.id}`;
    } catch {
      Message.error('更新任务状态失败');
    }
  };

  // 跳过任务
  const handleSkip = async (task: AnnotationTask) => {
    try {
      const res = await fetch(`/api/eval/annotation-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SKIPPED' }),
      });
      if (!res.ok) throw new Error('跳过失败');
      Message.success('已跳过');
      fetchTasks();
    } catch {
      Message.error('跳过任务失败');
    }
  };

  // 表格列定义
  const columns: ColumnProps<AnnotationTask>[] = [
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (_, record) => {
        const p = PRIORITY_MAP[record.priority] || PRIORITY_MAP[0];
        return <Tag color={p.color}>{p.text}</Tag>;
      },
    },
    {
      title: '对话 ID',
      dataIndex: 'conversationId',
      width: 200,
      render: (val: string) => (
        <span title={val} className="font-mono text-xs">
          {val.length > 16 ? val.slice(0, 8) + '...' + val.slice(-8) : val}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (_, record) => {
        const s = STATUS_MAP[record.status] || STATUS_MAP.PENDING;
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '负责人',
      dataIndex: 'assignedTo',
      width: 100,
      render: (val: string | null) => val || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (val: string) => new Date(val).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => {
        if (record.status === 'COMPLETED' || record.status === 'SKIPPED') {
          return <span className="text-gray-400 text-xs">-</span>;
        }
        return (
          <Space size="mini">
            <Button
              type="text"
              size="mini"
              icon={<IconPlayArrow />}
              onClick={() => handleStartTask(record)}
            >
              标注
            </Button>
            <Button
              type="text"
              size="mini"
              status="warning"
              icon={<IconSkipNext />}
              onClick={() => handleSkip(record)}
            >
              跳过
            </Button>
          </Space>
        );
      },
    },
  ];

  // 状态筛选标签
  const statusOptions = [
    { label: '全部', value: undefined },
    { label: '待标注', value: 'PENDING' },
    { label: '进行中', value: 'IN_PROGRESS' },
    { label: '已完成', value: 'COMPLETED' },
    { label: '已跳过', value: 'SKIPPED' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">标注任务队列</h2>
          <p className="text-sm text-gray-500">系统化的人工标注工作流，对低分评估进行复核</p>
        </div>
        <Space>
          <Button
            type="primary"
            icon={<IconPlus />}
            loading={generating}
            onClick={handleGenerate}
          >
            自动生成任务
          </Button>
          <Button
            type="outline"
            icon={<IconPlayArrow />}
            onClick={handleStartAnnotation}
          >
            开始标注
          </Button>
        </Space>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="总任务数" value={stats.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待标注"
              value={stats.pending}
              styleValue={{ color: stats.pending > 0 ? '#ff7d00' : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="进行中"
              value={stats.inProgress}
              styleValue={{ color: stats.inProgress > 0 ? '#165dff' : undefined }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已完成"
              value={stats.completed}
              styleValue={{ color: stats.completed > 0 ? '#00b42a' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      {/* 状态筛选 */}
      <div className="flex gap-2">
        {statusOptions.map(opt => (
          <Button
            key={opt.label}
            type={statusFilter === opt.value ? 'primary' : 'secondary'}
            size="small"
            onClick={() => { setStatusFilter(opt.value); setPage(1); }}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* 任务列表 */}
      <Card>
        <Table
          columns={columns}
          data={tasks}
          rowKey="id"
          loading={loading}
          pagination={false}
          noDataElement={<div className="py-10 text-gray-400">暂无标注任务，点击"自动生成任务"从低分评估中创建</div>}
        />
        {stats.total > pageSize && (
          <div className="flex justify-end mt-4">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={stats.total}
              onChange={setPage}
              showTotal
            />
          </div>
        )}
      </Card>
    </div>
  );
}
