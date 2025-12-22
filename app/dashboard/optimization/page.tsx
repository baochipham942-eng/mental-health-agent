'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Space, Message, Pagination, Statistic, Grid } from '@arco-design/web-react';
import { IconPlus, IconPlayArrow, IconDelete } from '@arco-design/web-react/icon';
import EvaluationList, { Evaluation } from './components/EvaluationList';
import SelectConversationModal from './components/SelectConversationModal';
import EvaluationDetailModal from './components/EvaluationDetailModal';

const Row = Grid.Row;
const Col = Grid.Col;

interface Stats {
    allConversations: number;
    pending: number;
    completed: number;
    lowScore: number;
}

export default function OptimizationPage() {
    const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
    const [stats, setStats] = useState<Stats>({ allConversations: 0, pending: 0, completed: 0, lowScore: 0 });
    const [loading, setLoading] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [selectModalVisible, setSelectModalVisible] = useState(false);
    const [selectedEvaluationIds, setSelectedEvaluationIds] = useState<string[]>([]);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);

    // 初始加载
    useEffect(() => {
        loadEvaluations();
    }, [page]);

    const loadEvaluations = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/optimization/evaluations?page=${page}&pageSize=${pageSize}`);
            if (res.ok) {
                const data = await res.json();
                setEvaluations(data.evaluations);
                setStats(data.stats);
                setTotal(data.total);
            } else {
                Message.error('加载评估列表失败');
            }
        } catch (error) {
            Message.error('加载评估列表失败');
        } finally {
            setLoading(false);
        }
    };

    // 添加选中的会话到列表（只创建记录，不评估）
    const handleAddConversations = async (conversationIds: string[]) => {
        try {
            const res = await fetch('/api/optimization/add-to-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationIds }),
            });

            if (res.ok) {
                const data = await res.json();
                Message.success(`已添加 ${data.added} 条会话到评估列表`);
                loadEvaluations();
            } else {
                const error = await res.json();
                Message.error(`添加失败: ${error.error}`);
            }
        } catch (error) {
            Message.error('添加失败');
        }
    };

    // 批量评估选中的记录
    const handleBatchEvaluate = async () => {
        // 筛选出待评估状态的记录
        const pendingIds = evaluations
            .filter(e => selectedEvaluationIds.includes(e.id) && e.overallGrade === 'EVALUATING')
            .map(e => e.conversationId);

        if (pendingIds.length === 0) {
            Message.warning('请选择待评估的会话');
            return;
        }

        setEvaluating(true);
        Message.info(`开始评估 ${pendingIds.length} 条会话...`);

        try {
            const res = await fetch('/api/optimization/evaluate-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationIds: pendingIds }),
            });

            if (res.ok) {
                const data = await res.json();
                Message.success(`评估完成！成功 ${data.success} 条，失败 ${data.failed} 条`);
                setSelectedEvaluationIds([]);
                loadEvaluations();
            } else {
                const error = await res.json();
                Message.error(`评估失败: ${error.error}`);
            }
        } catch (error) {
            Message.error('评估失败');
        } finally {
            setEvaluating(false);
        }
    };

    // 删除选中的评估记录
    const handleDeleteSelected = async () => {
        if (selectedEvaluationIds.length === 0) {
            Message.warning('请选择要删除的记录');
            return;
        }

        try {
            const res = await fetch('/api/optimization/delete-evaluations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ evaluationIds: selectedEvaluationIds }),
            });

            if (res.ok) {
                const data = await res.json();
                Message.success(`已删除 ${data.deleted} 条记录`);
                setSelectedEvaluationIds([]);
                loadEvaluations();
            } else {
                Message.error('删除失败');
            }
        } catch (error) {
            Message.error('删除失败');
        }
    };

    // 计算选中的待评估数量
    const selectedPendingCount = evaluations
        .filter(e => selectedEvaluationIds.includes(e.id) && e.overallGrade === 'EVALUATING')
        .length;

    // 点击行查看详情
    const handleRowClick = (evaluation: Evaluation) => {
        setSelectedEvaluation(evaluation);
        setDetailModalVisible(true);
    };

    return (
        <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 to-indigo-50">
            <div className="max-w-7xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Prompt 优化审批</h1>
                        <p className="text-sm text-gray-500 mt-1">基于 AI 评估的自动化 Prompt 改进建议</p>
                    </div>
                </div>

                {/* Stats */}
                <Row gutter={16}>
                    <Col span={6}>
                        <Card>
                            <Statistic
                                title="全部会话"
                                value={stats.allConversations}
                                suffix="条"
                                styleValue={{ color: '#165dff' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card>
                            <Statistic
                                title="待评估"
                                value={stats.pending}
                                suffix="条"
                                styleValue={{ color: '#00b42a' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card>
                            <Statistic
                                title="已评估"
                                value={stats.completed}
                                suffix="条"
                                styleValue={{ color: '#3370ff' }}
                            />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card>
                            <Statistic
                                title="低分会话"
                                value={stats.lowScore}
                                suffix="条"
                                styleValue={{ color: '#f77234' }}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* Actions */}
                <Card className="shadow-md">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">评估列表</h3>
                        <Space>
                            <Button
                                icon={<IconPlus />}
                                onClick={() => setSelectModalVisible(true)}
                            >
                                选择会话
                            </Button>
                            <Button
                                type="primary"
                                icon={<IconPlayArrow />}
                                loading={evaluating}
                                onClick={handleBatchEvaluate}
                                disabled={selectedPendingCount === 0}
                            >
                                {evaluating ? '评估中...' : `批量评估 (${selectedPendingCount})`}
                            </Button>
                            <Button
                                status="danger"
                                icon={<IconDelete />}
                                onClick={handleDeleteSelected}
                                disabled={selectedEvaluationIds.length === 0}
                            >
                                删除 ({selectedEvaluationIds.length})
                            </Button>
                        </Space>
                    </div>
                </Card>

                {/* Evaluation List */}
                <EvaluationList
                    evaluations={evaluations}
                    loading={loading}
                    selectedRowKeys={selectedEvaluationIds}
                    onSelectionChange={setSelectedEvaluationIds}
                    onRowClick={handleRowClick}
                />

                {/* Pagination */}
                {total > pageSize && (
                    <div className="flex justify-center">
                        <Pagination
                            current={page}
                            pageSize={pageSize}
                            total={total}
                            onChange={setPage}
                        />
                    </div>
                )}

                {/* Select Conversation Modal */}
                <SelectConversationModal
                    visible={selectModalVisible}
                    onClose={() => setSelectModalVisible(false)}
                    onConfirm={handleAddConversations}
                />

                {/* Evaluation Detail Modal */}
                <EvaluationDetailModal
                    visible={detailModalVisible}
                    evaluation={selectedEvaluation}
                    onClose={() => {
                        setDetailModalVisible(false);
                        setSelectedEvaluation(null);
                    }}
                    onAdopted={() => {
                        loadEvaluations();
                    }}
                />
            </div>
        </div>
    );
}
