'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Input, Select, Table, Tag, Space, Message } from '@arco-design/web-react';
import { IconPlus, IconDelete, IconSwap } from '@arco-design/web-react/icon';
import type { ColumnProps } from '@arco-design/web-react/es/Table';

const TextArea = Input.TextArea;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface DatasetVersion {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  caseCount: number;
  createdBy: string;
  createdAt: string;
}

interface DatasetVersionCase {
  id: string;
  versionId: string;
  caseId: string;
  scenario: string;
  userInput: string;
  expectedBehavior: string | null;
  tags: string[];
  createdAt: string;
}

interface CompareResult {
  added: string[];
  removed: string[];
  common: string[];
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function DatasetVersionsPage() {
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [loading, setLoading] = useState(true);

  // 创建弹窗
  const [createVisible, setCreateVisible] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createParent, setCreateParent] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  // 版本详情
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailVersion, setDetailVersion] = useState<DatasetVersion | null>(null);
  const [detailCases, setDetailCases] = useState<DatasetVersionCase[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 版本对比
  const [compareA, setCompareA] = useState<string | undefined>(undefined);
  const [compareB, setCompareB] = useState<string | undefined>(undefined);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);

  // --------------------------------------------------------------------------
  // 数据加载
  // --------------------------------------------------------------------------

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/eval/dataset-versions');
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (e) {
      console.error('加载版本列表失败:', e);
      Message.error('加载版本列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  // --------------------------------------------------------------------------
  // 创建版本
  // --------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!createName.trim()) {
      Message.warning('请输入版本名称');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/eval/dataset-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || undefined,
          parentId: createParent || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '创建失败');
      }
      Message.success('版本创建成功');
      setCreateVisible(false);
      setCreateName('');
      setCreateDesc('');
      setCreateParent(undefined);
      loadVersions();
    } catch (e: any) {
      Message.error(e.message || '创建版本失败');
    } finally {
      setCreating(false);
    }
  };

  // --------------------------------------------------------------------------
  // 查看详情
  // --------------------------------------------------------------------------

  const viewDetail = async (version: DatasetVersion) => {
    setDetailVersion(version);
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/eval/dataset-versions/${version.id}`);
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setDetailCases(data.cases || []);
    } catch (e) {
      Message.error('加载版本详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // 删除版本
  // --------------------------------------------------------------------------

  const handleDelete = (version: DatasetVersion) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除版本「${version.name}」及其所有用例吗？此操作不可撤销。`,
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          const res = await fetch(`/api/eval/dataset-versions/${version.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('删除失败');
          Message.success('版本已删除');
          loadVersions();
        } catch (e: any) {
          Message.error(e.message || '删除失败');
        }
      },
    });
  };

  // --------------------------------------------------------------------------
  // 版本对比
  // --------------------------------------------------------------------------

  const handleCompare = async () => {
    if (!compareA || !compareB) {
      Message.warning('请选择两个版本进行对比');
      return;
    }
    if (compareA === compareB) {
      Message.warning('请选择两个不同的版本');
      return;
    }
    setComparing(true);
    setCompareResult(null);
    try {
      const res = await fetch(`/api/eval/dataset-versions/compare?a=${compareA}&b=${compareB}`);
      if (!res.ok) throw new Error('对比失败');
      const data = await res.json();
      setCompareResult(data);
    } catch (e: any) {
      Message.error(e.message || '版本对比失败');
    } finally {
      setComparing(false);
    }
  };

  // --------------------------------------------------------------------------
  // 详情弹窗的用例表格列
  // --------------------------------------------------------------------------

  const caseColumns: ColumnProps<DatasetVersionCase>[] = [
    {
      title: '用例 ID',
      dataIndex: 'caseId',
      width: 160,
      render: (v: string) => <span className="font-mono text-xs">{v}</span>,
    },
    {
      title: '场景',
      dataIndex: 'scenario',
      width: 120,
      render: (v: string) => <Tag size="small">{v}</Tag>,
    },
    {
      title: '用户输入',
      dataIndex: 'userInput',
      ellipsis: true,
      render: (v: string) => <span className="text-sm">{v}</span>,
    },
    {
      title: '期望行为',
      dataIndex: 'expectedBehavior',
      ellipsis: true,
      render: (v: string | null) => v ? <span className="text-sm text-gray-600">{v}</span> : <span className="text-gray-400">-</span>,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 160,
      render: (tags: string[]) => (
        <Space size={2} wrap>
          {tags.map((t, i) => <Tag key={i} size="small" color="arcoblue">{t}</Tag>)}
        </Space>
      ),
    },
  ];

  // --------------------------------------------------------------------------
  // 渲染
  // --------------------------------------------------------------------------

  const versionNameById = (id: string) => versions.find(v => v.id === id)?.name || id;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">数据集版本管理</h2>
          <p className="text-sm text-gray-500">管理评测数据集的版本快照，支持版本对比</p>
        </div>
        <Button
          type="primary"
          icon={<IconPlus />}
          onClick={() => setCreateVisible(true)}
        >
          创建新版本
        </Button>
      </div>

      {/* 版本列表 */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : versions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p>暂无数据集版本</p>
          <p className="text-xs mt-2">点击「创建新版本」开始管理</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {versions.map(v => (
            <Card
              key={v.id}
              className="shadow-xs hover:shadow-md transition-shadow"
              hoverable
            >
              <div className="space-y-3">
                {/* 名称和描述 */}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-base">{v.name}</h3>
                    {v.parentId && (
                      <Tag size="small" color="gray">
                        继承自 {versionNameById(v.parentId)}
                      </Tag>
                    )}
                  </div>
                  {v.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{v.description}</p>
                  )}
                </div>

                {/* 统计信息 */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-600">
                    <span className="font-semibold text-indigo-600">{v.caseCount}</span> 条用例
                  </span>
                  <span className="text-gray-400 text-xs">
                    {new Date(v.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="small"
                    type="text"
                    onClick={() => viewDetail(v)}
                  >
                    查看详情
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    status="danger"
                    icon={<IconDelete />}
                    onClick={() => handleDelete(v)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 版本对比 */}
      {versions.length >= 2 && (
        <Card className="shadow-xs" title={
          <div className="flex items-center gap-2">
            <IconSwap className="text-indigo-500" />
            <span className="font-semibold">版本对比</span>
          </div>
        }>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Select
                placeholder="选择版本 A"
                value={compareA}
                onChange={setCompareA}
                style={{ width: 240 }}
                allowClear
              >
                {versions.map(v => (
                  <Select.Option key={v.id} value={v.id}>
                    {v.name}（{v.caseCount} 条）
                  </Select.Option>
                ))}
              </Select>
              <span className="text-gray-400">vs</span>
              <Select
                placeholder="选择版本 B"
                value={compareB}
                onChange={setCompareB}
                style={{ width: 240 }}
                allowClear
              >
                {versions.map(v => (
                  <Select.Option key={v.id} value={v.id}>
                    {v.name}（{v.caseCount} 条）
                  </Select.Option>
                ))}
              </Select>
              <Button
                type="primary"
                loading={comparing}
                onClick={handleCompare}
                disabled={!compareA || !compareB}
              >
                对比
              </Button>
            </div>

            {compareResult && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{compareResult.added.length}</div>
                  <div className="text-sm text-green-700 mt-1">B 新增用例</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{compareResult.removed.length}</div>
                  <div className="text-sm text-red-700 mt-1">B 移除用例</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{compareResult.common.length}</div>
                  <div className="text-sm text-blue-700 mt-1">共同用例</div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 创建版本弹窗 */}
      <Modal
        title="创建新版本"
        visible={createVisible}
        onCancel={() => {
          setCreateVisible(false);
          setCreateName('');
          setCreateDesc('');
          setCreateParent(undefined);
        }}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        unmountOnExit
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              版本名称 <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="如 v1.0-baseline"
              value={createName}
              onChange={setCreateName}
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <TextArea
              placeholder="版本描述（可选）"
              value={createDesc}
              onChange={setCreateDesc}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">父版本</label>
            <Select
              placeholder="选择父版本（可选）"
              value={createParent}
              onChange={setCreateParent}
              allowClear
              style={{ width: '100%' }}
            >
              {versions.map(v => (
                <Select.Option key={v.id} value={v.id}>
                  {v.name}（{v.caseCount} 条用例）
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>

      {/* 版本详情弹窗 */}
      <Modal
        title={detailVersion ? `版本详情 — ${detailVersion.name}` : '版本详情'}
        visible={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setDetailVersion(null);
          setDetailCases([]);
        }}
        footer={null}
        style={{ width: 900, maxWidth: '95vw', top: 40 }}
        unmountOnExit
      >
        {detailVersion && (
          <div className="space-y-4">
            {/* 版本信息 */}
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>创建者: {detailVersion.createdBy}</span>
              <span>创建时间: {new Date(detailVersion.createdAt).toLocaleString('zh-CN')}</span>
              <span>用例数: {detailVersion.caseCount}</span>
              {detailVersion.parentId && (
                <span>父版本: {versionNameById(detailVersion.parentId)}</span>
              )}
            </div>
            {detailVersion.description && (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                {detailVersion.description}
              </p>
            )}

            {/* 用例表格 */}
            <Table
              columns={caseColumns}
              data={detailCases}
              rowKey="id"
              loading={detailLoading}
              pagination={detailCases.length > 20 ? { pageSize: 20 } : false}
              size="small"
              noDataElement={<span className="text-gray-400">该版本暂无用例</span>}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
