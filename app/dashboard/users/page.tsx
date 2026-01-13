'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Card,
    Table,
    Input,
    Pagination,
    Statistic,
    Grid,
    Avatar,
    Message,
    Empty,
    Spin,
} from '@arco-design/web-react';
import { IconSearch, IconUser, IconPlus, IconMessage, IconExperiment, IconClockCircle } from '@arco-design/web-react/icon';

const Row = Grid.Row;
const Col = Grid.Col;

interface User {
    id: string;
    username: string;
    nickname: string;
    avatar: string | null;
    phone: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    conversationCount: number;
    labSessionCount: number;
    isAdmin: boolean;
}

interface Stats {
    totalUsers: number;
    todayNewUsers: number;
    activeUsers: number;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [stats, setStats] = useState<Stats>({ totalUsers: 0, todayNewUsers: 0, activeUsers: 0 });
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('lastLoginAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                pageSize: pageSize.toString(),
                sortBy,
                sortOrder,
            });
            if (search) {
                params.set('search', search);
            }

            const res = await fetch(`/api/admin/users?${params}`);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users);
                setStats(data.stats);
                setTotal(data.total);
            } else if (res.status === 403) {
                Message.error('无权访问');
            } else {
                Message.error('加载用户列表失败');
            }
        } catch (error) {
            Message.error('加载用户列表失败');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, sortBy, sortOrder]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

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

    // 表格列定义
    const columns = [
        {
            title: '用户',
            dataIndex: 'user',
            width: 220,
            render: (_: any, record: User) => (
                <div className="flex items-center gap-3">
                    <Avatar size={40} style={{ backgroundColor: '#7265e6' }}>
                        {record.avatar ? (
                            <img src={record.avatar} alt={record.nickname} />
                        ) : (
                            record.nickname?.charAt(0) || <IconUser />
                        )}
                    </Avatar>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{record.nickname}</span>
                            {record.isAdmin && (
                                <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded">管理员</span>
                            )}
                        </div>
                        <div className="text-xs text-gray-500">@{record.username}</div>
                    </div>
                </div>
            ),
        },
        {
            title: '手机号',
            dataIndex: 'phone',
            width: 140,
            render: (phone: string | null) => (
                <span className="font-mono text-gray-600">
                    {phone || '-'}
                </span>
            ),
        },
        {
            title: '注册时间',
            dataIndex: 'createdAt',
            width: 180,
            sorter: true,
            render: (date: string) => (
                <span className="text-gray-600">{formatDate(date)}</span>
            ),
        },
        {
            title: '会话数',
            dataIndex: 'conversationCount',
            width: 100,
            sorter: true,
            render: (count: number) => (
                <div className="flex items-center gap-1">
                    <IconMessage className="text-blue-500" />
                    <span className="font-medium">{count}</span>
                </div>
            ),
        },
        {
            title: '实验室',
            dataIndex: 'labSessionCount',
            width: 100,
            sorter: true,
            render: (count: number) => (
                <div className="flex items-center gap-1">
                    <IconExperiment className="text-purple-500" />
                    <span className="font-medium">{count}</span>
                </div>
            ),
        },
        {
            title: '上次登录',
            dataIndex: 'lastLoginAt',
            width: 160,
            sorter: true,
            render: (date: string | null) => (
                <div className="flex items-center gap-1">
                    <IconClockCircle className="text-gray-400" />
                    <span className="text-gray-600">
                        {date ? formatDate(date) : '-'}
                    </span>
                </div>
            ),
        },
    ];

    // 处理表格排序
    const handleTableChange = (_: any, sorter: any) => {
        if (sorter) {
            const field = sorter.field === 'user' ? 'nickname' : sorter.field;
            setSortBy(field);
            setSortOrder(sorter.direction === 'ascend' ? 'asc' : 'desc');
        }
    };

    return (
        <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 to-indigo-50">
            <div className="max-w-7xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
                        <p className="text-sm text-gray-500 mt-1">查看和管理注册用户</p>
                    </div>
                </div>

                {/* Stats */}
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={8}>
                        <Card>
                            <Statistic
                                title={
                                    <span className="flex items-center gap-2">
                                        <IconUser /> 总用户数
                                    </span>
                                }
                                value={stats.totalUsers}
                                suffix="人"
                                styleValue={{ color: '#165dff' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Card>
                            <Statistic
                                title={
                                    <span className="flex items-center gap-2">
                                        <IconPlus /> 今日新增
                                    </span>
                                }
                                value={stats.todayNewUsers}
                                suffix="人"
                                styleValue={{ color: '#00b42a' }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Card>
                            <Statistic
                                title={
                                    <span className="flex items-center gap-2">
                                        <IconMessage /> 活跃用户
                                    </span>
                                }
                                value={stats.activeUsers}
                                suffix="人"
                                styleValue={{ color: '#722ed1' }}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* Search & Table */}
                <Card className="shadow-md">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <h3 className="text-lg font-semibold">用户列表</h3>
                        <Input.Search
                            placeholder="搜索昵称、用户名或手机号"
                            prefix={<IconSearch />}
                            value={searchInput}
                            onChange={setSearchInput}
                            style={{ width: 280 }}
                            allowClear
                        />
                    </div>

                    <Spin loading={loading} style={{ display: 'block' }}>
                        {users.length > 0 ? (
                            <Table
                                columns={columns}
                                data={users}
                                rowKey="id"
                                pagination={false}
                                onChange={handleTableChange}
                                scroll={{ x: 960 }}
                            />
                        ) : (
                            <Empty description="暂无用户数据" />
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
        </div>
    );
}
