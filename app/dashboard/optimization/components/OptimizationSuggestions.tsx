'use client';

import { Card, Tag, Button, Space, Collapse, Message, Empty } from '@arco-design/web-react';
import { IconCheck, IconClose } from '@arco-design/web-react/icon';
import { useState } from 'react';

const CollapseItem = Collapse.Item;

interface OptimizationLog {
    id: string;
    analyzedPeriod: string;
    lowScoreCount: number;
    commonIssues: {
        legal: string[];
        ethical: string[];
        professional: string[];
        ux: string[];
    };
    suggestions: string[];
    affectedPrompts: string[];
    appliedAt: string | null;
    appliedBy: string | null;
    createdAt: string;
}

interface OptimizationSuggestionsProps {
    logs: OptimizationLog[];
    onRefresh: () => void;
}

export default function OptimizationSuggestions({
    logs,
    onRefresh,
}: OptimizationSuggestionsProps) {
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const handleApprove = async (logId: string) => {
        setApprovingId(logId);
        try {
            const res = await fetch(`/api/optimization/approve/${logId}`, {
                method: 'POST',
            });

            if (res.ok) {
                Message.success('已批准！请手动修改代码并应用建议');
                onRefresh();
            } else {
                Message.error('批准失败');
            }
        } catch (error) {
            Message.error('批准失败');
        } finally {
            setApprovingId(null);
        }
    };

    if (logs.length === 0) {
        return (
            <Card className="shadow-lg">
                <Empty
                    description={
                        <div className="space-y-2">
                            <p>暂无优化建议</p>
                            <p className="text-sm text-gray-500">请先评估会话，然后点击"运行新分析"生成建议</p>
                        </div>
                    }
                />
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {logs.map((log) => (
                <Card
                    key={log.id}
                    className="shadow-lg"
                    title={
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-lg font-semibold">优化分析</span>
                                <span className="text-sm text-gray-500 ml-3">{log.analyzedPeriod}</span>
                            </div>
                            {log.appliedAt ? (
                                <Tag color="green">
                                    已批准 by {log.appliedBy} · {new Date(log.appliedAt).toLocaleString('zh-CN')}
                                </Tag>
                            ) : (
                                <Tag color="orange">待审批</Tag>
                            )}
                        </div>
                    }
                >
                    {/* 概览 */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-gray-700">
                            📊 发现 <span className="font-semibold text-blue-600">{log.lowScoreCount}</span> 个低分对话 ·
                            生成 <span className="font-semibold text-blue-600">{log.suggestions.length}</span> 条建议
                        </p>
                    </div>

                    {/* 问题汇总 */}
                    <div className="mb-6">
                        <h4 className="text-base font-semibold mb-3">💡 问题汇总</h4>
                        <div className="grid grid-cols-2 gap-4">
                            {log.commonIssues.legal.length > 0 && (
                                <div className="p-3 bg-red-50 rounded border border-red-200">
                                    <div className="text-sm font-medium text-red-700 mb-2">法律问题</div>
                                    <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                                        {log.commonIssues.legal.map((issue, i) => (
                                            <li key={i}>{issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {log.commonIssues.professional.length > 0 && (
                                <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                                    <div className="text-sm font-medium text-yellow-700 mb-2">专业性问题</div>
                                    <ul className="list-disc list-inside text-sm text-yellow-600 space-y-1">
                                        {log.commonIssues.professional.map((issue, i) => (
                                            <li key={i}>{issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {log.commonIssues.ux.length > 0 && (
                                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                                    <div className="text-sm font-medium text-blue-700 mb-2">用户体验问题</div>
                                    <ul className="list-disc list-inside text-sm text-blue-600 space-y-1">
                                        {log.commonIssues.ux.map((issue, i) => (
                                            <li key={i}>{issue}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 优化建议 */}
                    <div className="mb-6">
                        <h4 className="text-base font-semibold mb-3">🔧 AI 生成的优化建议</h4>
                        <Collapse defaultActiveKey={['0']}>
                            {log.suggestions.map((suggestion, index) => (
                                <CollapseItem
                                    key={index}
                                    header={`建议 #${index + 1}`}
                                    name={String(index)}
                                >
                                    <div className="p-4 bg-gray-50 rounded">
                                        <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                                            {suggestion}
                                        </pre>
                                    </div>
                                </CollapseItem>
                            ))}
                        </Collapse>
                    </div>

                    {/* 受影响的 Prompts */}
                    <div className="mb-6">
                        <h4 className="text-base font-semibold mb-3">📁 受影响的 Prompt</h4>
                        <div className="flex flex-wrap gap-2">
                            {log.affectedPrompts.map((prompt, index) => (
                                <Tag key={index} color="arcoblue" className="text-xs">
                                    {prompt}
                                </Tag>
                            ))}
                        </div>
                    </div>

                    {/* 操作按钮 */}
                    {!log.appliedAt && log.lowScoreCount > 0 && (
                        <div className="flex justify-end">
                            <Button
                                type="primary"
                                status="success"
                                icon={<IconCheck />}
                                loading={approvingId === log.id}
                                onClick={() => handleApprove(log.id)}
                            >
                                批准应用
                            </Button>
                        </div>
                    )}
                </Card>
            ))}
        </div>
    );
}
