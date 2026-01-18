'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Card,
    Table,
    Input,
    Pagination,
    Statistic,
    Grid,
    Message,
    Empty,
    Spin,
    Button,
    Modal,
    Form,
    InputNumber,
    Tag,
    Tooltip,
    Popconfirm,
    Select,
} from '@arco-design/web-react';
import {
    IconSearch,
    IconPlus,
    IconCopy,
    IconEdit,
    IconDelete,
    IconStop,
    IconCheckCircle,
    IconCloseCircle,
    IconClockCircle,
} from '@arco-design/web-react/icon';

const Row = Grid.Row;
const Col = Grid.Col;
const FormItem = Form.Item;

interface InviteCode {
    id: string;
    code: string;
    type: string;
    maxUsages: number;
    usedCount: number;
    remainingUsages: number;
    expiresAt: string;
    channel: string | null;
    createdAt: string;
    status: string;
    isExpired: boolean;
    isExhausted: boolean;
}

interface Stats {
    totalInvites: number;
    activeInvites: number;
    expiredInvites: number;
    totalUsed: number;
}

export default function InvitesPage() {
    const [invites, setInvites] = useState<InviteCode[]>([]);
    const [stats, setStats] = useState<Stats>({
        totalInvites: 0,
        activeInvites: 0,
        expiredInvites: 0,
        totalUsed: 0,
    });
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // 弹窗状态
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingInvite, setEditingInvite] = useState<InviteCode | null>(null);
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const [creating, setCreating] = useState(false);
    const [updating, setUpdating] = useState(false);

    // 加载邀请码列表
    const loadInvites = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: pageSize.toString(),
                sortBy,
                sortOrder,
                status: statusFilter,
            });
            if (search) {
                params.set('search', search);
            }

            const res = await fetch(`/api/admin/invites?${params}`);
            if (res.ok) {
                const data = await res.json();
                setInvites(data.invites);
                setStats(data.stats);
                setTotal(data.total);
            } else if (res.status === 403) {
                Message.error('无权访问');
            } else {
                Message.error('加载邀请码列表失败');
            }
        } catch (error) {
            Message.error('加载邀请码列表失败');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, sortBy, sortOrder, statusFilter]);

    useEffect(() => {
        loadInvites();
    }, [loadInvites]);

    // 搜索防抖
    const [searchInput, setSearchInput] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // 格式化日期
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // 复制邀请码
    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            Message.success(`已复制: ${code}`);
        }).catch(() => {
            Message.error('复制失败');
        });
    };

    // 创建邀请码
    const handleCreate = async () => {
        try {
            const values = await createForm.validate();
            setCreating(true);

            const res = await fetch('/api/admin/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
            });

            const data = await res.json();
            if (res.ok) {
                Message.success(`成功创建 ${data.count} 个邀请码`);
                setCreateModalVisible(false);
                createForm.resetFields();
                loadInvites();
            } else {
                Message.error(data.error || '创建失败');
            }
        } catch (error) {
            // 表单验证失败
        } finally {
            setCreating(false);
        }
    };

    // 修改邀请码
    const handleEdit = (invite: InviteCode) => {
        setEditingInvite(invite);
        editForm.setFieldsValue({ maxUsages: invite.maxUsages });
        setEditModalVisible(true);
    };

    const handleUpdate = async () => {
        if (!editingInvite) return;
        try {
            const values = await editForm.validate();
            setUpdating(true);

            const res = await fetch('/api/admin/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingInvite.id, maxUsages: values.maxUsages }),
            });

            const data = await res.json();
            if (res.ok) {
                Message.success('更新成功');
                setEditModalVisible(false);
                loadInvites();
            } else {
                Message.error(data.error || '更新失败');
            }
        } catch (error) {
            // 表单验证失败
        } finally {
            setUpdating(false);
        }
    };

    // 作废邀请码
    const handleRevoke = async (invite: InviteCode) => {
        try {
            const res = await fetch('/api/admin/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: invite.id, action: 'revoke' }),
            });

            const data = await res.json();
            if (res.ok) {
                Message.success('邀请码已作废');
                loadInvites();
            } else {
                Message.error(data.error || '操作失败');
            }
        } catch (error) {
            Message.error('操作失败');
        }
    };

    // 删除邀请码
    const handleDelete = async (invite: InviteCode) => {
        try {
            const res = await fetch(`/api/admin/invites?id=${invite.id}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (res.ok) {
                Message.success('邀请码已删除');
                loadInvites();
            } else {
                Message.error(data.error || '删除失败');
            }
        } catch (error) {
            Message.error('删除失败');
        }
    };

    // 表格列定义
    const columns = [
        {
            title: '邀请码',
            dataIndex: 'code',
            width: 140,
            render: (code: string, record: InviteCode) => (
                <div className="flex items-center gap-2">
                    <code className={`font-mono font-bold text-base px-2 py-1 rounded ${
                        record.isExpired || record.isExhausted
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-indigo-50 text-indigo-600'
                    }`}>
                        {code}
                    </code>
                    <Tooltip content="复制">
                        <IconCopy
                            className="text-gray-400 hover:text-indigo-500 cursor-pointer"
                            onClick={() => copyCode(code)}
                        />
                    </Tooltip>
                </div>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (status: string, record: InviteCode) => {
                if (record.isExpired) {
                    return <Tag color="gray" icon={<IconCloseCircle />}>已过期</Tag>;
                }
                if (record.isExhausted) {
                    return <Tag color="orange" icon={<IconClockCircle />}>已用完</Tag>;
                }
                return <Tag color="green" icon={<IconCheckCircle />}>有效</Tag>;
            },
        },
        {
            title: '使用情况',
            dataIndex: 'usage',
            width: 130,
            render: (_: any, record: InviteCode) => (
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${
                                record.usedCount >= record.maxUsages
                                    ? 'bg-red-400'
                                    : record.usedCount > 0
                                        ? 'bg-green-400'
                                        : 'bg-gray-200'
                            }`}
                            style={{ width: `${(record.usedCount / record.maxUsages) * 100}%` }}
                        />
                    </div>
                    <span className="text-sm text-gray-600 whitespace-nowrap">
                        {record.usedCount}/{record.maxUsages}
                    </span>
                </div>
            ),
        },
        {
            title: '剩余次数',
            dataIndex: 'remainingUsages',
            width: 90,
            sorter: true,
            render: (remaining: number) => (
                <span className={`font-medium ${remaining > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {remaining}
                </span>
            ),
        },
        {
            title: '过期时间',
            dataIndex: 'expiresAt',
            width: 170,
            sorter: true,
            render: (date: string, record: InviteCode) => (
                <span className={record.isExpired ? 'text-red-500' : 'text-gray-600'}>
                    {formatDate(date)}
                </span>
            ),
        },
        {
            title: '渠道',
            dataIndex: 'channel',
            width: 100,
            render: (channel: string | null) => (
                <span className="text-gray-500 text-sm">
                    {channel || '-'}
                </span>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 170,
            sorter: true,
            render: (date: string) => (
                <span className="text-gray-600">{formatDate(date)}</span>
            ),
        },
        {
            title: '操作',
            dataIndex: 'actions',
            width: 160,
            fixed: 'right' as const,
            render: (_: any, record: InviteCode) => (
                <div className="flex items-center gap-1">
                    {!record.isExpired && !record.isExhausted && (
                        <Tooltip content="修改可用次数">
                            <Button
                                type="text"
                                size="small"
                                icon={<IconEdit />}
                                onClick={() => handleEdit(record)}
                            />
                        </Tooltip>
                    )}
                    {!record.isExpired && (
                        <Popconfirm
                            title="确定要作废这个邀请码吗？"
                            onOk={() => handleRevoke(record)}
                        >
                            <Tooltip content="作废">
                                <Button
                                    type="text"
                                    size="small"
                                    status="warning"
                                    icon={<IconStop />}
                                />
                            </Tooltip>
                        </Popconfirm>
                    )}
                    {record.usedCount === 0 && (
                        <Popconfirm
                            title="确定要删除这个邀请码吗？"
                            onOk={() => handleDelete(record)}
                        >
                            <Tooltip content="删除">
                                <Button
                                    type="text"
                                    size="small"
                                    status="danger"
                                    icon={<IconDelete />}
                                />
                            </Tooltip>
                        </Popconfirm>
                    )}
                </div>
            ),
        },
    ];

    // 处理表格排序
    const handleTableChange = (_: any, sorter: any) => {
        if (sorter) {
            setSortBy(sorter.field);
            setSortOrder(sorter.direction === 'ascend' ? 'asc' : 'desc');
        }
    };

    return (
        <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 to-indigo-50">
            <div className="max-w-7xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">邀请码管理</h1>
                        <p className="text-sm text-gray-500 mt-1">管理用户注册邀请码</p>
                    </div>
                    <Button
                        type="primary"
                        icon={<IconPlus />}
                        onClick={() => setCreateModalVisible(true)}
                    >
                        生成邀请码
                    </Button>
                </div>

                {/* Stats */}
                <Row gutter={[16, 16]}>
                    <Col xs={12} sm={6}>
                        <Card>
                            <Statistic
                                title="总邀请码"
                                value={stats.totalInvites}
                                suffix="个"
                                styleValue={{ color: '#165dff' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={6}>
                        <Card>
                            <Statistic
                                title="有效邀请码"
                                value={stats.activeInvites}
                                suffix="个"
                                styleValue={{ color: '#00b42a' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={6}>
                        <Card>
                            <Statistic
                                title="已过期"
                                value={stats.expiredInvites}
                                suffix="个"
                                styleValue={{ color: '#86909c' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={6}>
                        <Card>
                            <Statistic
                                title="已使用次数"
                                value={stats.totalUsed}
                                suffix="次"
                                styleValue={{ color: '#722ed1' }}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* Search & Table */}
                <Card className="shadow-md">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <h3 className="text-lg font-semibold">邀请码列表</h3>
                        <div className="flex gap-3 flex-wrap">
                            <Select
                                placeholder="状态筛选"
                                value={statusFilter}
                                onChange={setStatusFilter}
                                style={{ width: 120 }}
                            >
                                <Select.Option value="all">全部</Select.Option>
                                <Select.Option value="active">有效</Select.Option>
                                <Select.Option value="expired">已过期</Select.Option>
                                <Select.Option value="exhausted">已用完</Select.Option>
                            </Select>
                            <Input.Search
                                placeholder="搜索邀请码"
                                prefix={<IconSearch />}
                                value={searchInput}
                                onChange={setSearchInput}
                                style={{ width: 200 }}
                                allowClear
                            />
                        </div>
                    </div>

                    <Spin loading={loading} style={{ display: 'block' }}>
                        {invites.length > 0 ? (
                            <Table
                                columns={columns}
                                data={invites}
                                rowKey="id"
                                pagination={false}
                                onChange={handleTableChange}
                                scroll={{ x: 1100 }}
                            />
                        ) : (
                            <Empty description="暂无邀请码数据" />
                        )}
                    </Spin>

                    {/* Pagination */}
                    {total > pageSize && (
                        <div className="flex justify-center mt-4">
                            <Pagination
                                current={page}
                                pageSize={pageSize}
                                total={total}
                                onChange={setPage}
                                showTotal
                            />
                        </div>
                    )}
                </Card>
            </div>

            {/* 创建邀请码弹窗 */}
            <Modal
                title="生成邀请码"
                visible={createModalVisible}
                onCancel={() => setCreateModalVisible(false)}
                onOk={handleCreate}
                confirmLoading={creating}
                okText="生成"
            >
                <Form form={createForm} layout="vertical">
                    <FormItem
                        label="生成数量"
                        field="count"
                        initialValue={1}
                        rules={[
                            { required: true, message: '请输入数量' },
                            { type: 'number', min: 1, max: 100, message: '数量必须在 1-100 之间' },
                        ]}
                    >
                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                    </FormItem>
                    <FormItem
                        label="每个邀请码可用次数"
                        field="maxUsages"
                        initialValue={5}
                        rules={[
                            { required: true, message: '请输入可用次数' },
                            { type: 'number', min: 1, max: 1000, message: '次数必须在 1-1000 之间' },
                        ]}
                    >
                        <InputNumber min={1} max={1000} style={{ width: '100%' }} />
                    </FormItem>
                    <FormItem
                        label="有效天数"
                        field="daysValid"
                        initialValue={7}
                        rules={[
                            { required: true, message: '请输入有效天数' },
                            { type: 'number', min: 1, max: 365, message: '天数必须在 1-365 之间' },
                        ]}
                    >
                        <InputNumber min={1} max={365} style={{ width: '100%' }} suffix="天" />
                    </FormItem>
                    <FormItem
                        label="渠道标识"
                        field="channel"
                        initialValue="admin"
                    >
                        <Input placeholder="例如: wechat, website, test" />
                    </FormItem>
                </Form>
            </Modal>

            {/* 编辑邀请码弹窗 */}
            <Modal
                title={`修改邀请码: ${editingInvite?.code || ''}`}
                visible={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                onOk={handleUpdate}
                confirmLoading={updating}
                okText="保存"
            >
                <Form form={editForm} layout="vertical">
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-500">当前使用情况</div>
                        <div className="text-lg font-medium">
                            已使用 {editingInvite?.usedCount || 0} 次
                        </div>
                    </div>
                    <FormItem
                        label="可用次数"
                        field="maxUsages"
                        rules={[
                            { required: true, message: '请输入可用次数' },
                            {
                                type: 'number',
                                min: editingInvite?.usedCount || 1,
                                max: 1000,
                                message: `次数必须在 ${editingInvite?.usedCount || 1}-1000 之间`,
                            },
                        ]}
                    >
                        <InputNumber
                            min={editingInvite?.usedCount || 1}
                            max={1000}
                            style={{ width: '100%' }}
                        />
                    </FormItem>
                </Form>
            </Modal>
        </div>
    );
}
