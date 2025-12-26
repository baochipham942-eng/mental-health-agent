'use client';

import { Card, Descriptions, Tag, Space, Empty } from '@arco-design/web-react';
import { Evaluation } from './EvaluationList';

interface EvaluationDetailProps {
    evaluation: Evaluation | null;
}

function getGradeColor(grade: string): string {
    const gradeMap: Record<string, string> = {
        A: 'green',
        B: 'arcoblue',
        C: 'gold',
        D: 'orange',
        F: 'red',
    };
    return gradeMap[grade] || 'gray';
}

function scoreToGrade(score: number): string {
    if (score >= 9) return 'A';
    if (score >= 7) return 'B';
    if (score >= 5) return 'C';
    if (score >= 3) return 'D';
    return 'F';
}

function IssuesList({ issues, title }: { issues: string[]; title: string }) {
    if (issues.length === 0) {
        return (
            <div className="text-sm text-gray-400">
                ✅ {title}：无问题发现
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="text-sm font-medium text-gray-700">⚠️ {title}：</div>
            <ul className="list-disc list-inside space-y-1 ml-2">
                {issues.map((issue, i) => (
                    <li key={i} className="text-sm text-gray-600">{issue}</li>
                ))}
            </ul>
        </div>
    );
}

export default function EvaluationDetail({ evaluation }: EvaluationDetailProps) {
    if (!evaluation) {
        return (
            <Card className="shadow-md">
                <Empty description="选择一个评估查看详情" />
            </Card>
        );
    }

    const legalGrade = scoreToGrade(evaluation.legalScore);
    const ethicalGrade = scoreToGrade(evaluation.ethicalScore);
    const professionalGrade = scoreToGrade(evaluation.professionalScore);
    const uxGrade = scoreToGrade(evaluation.uxScore);

    return (
        <Card
            className="shadow-md"
            title={
                <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">评估详情</span>
                    <Space>
                        <span className="text-sm text-gray-500">总分：</span>
                        <Tag color={getGradeColor(evaluation.overallGrade)} style={{ fontSize: '16px', fontWeight: 'bold' }}>
                            {evaluation.overallGrade}
                        </Tag>
                        <span className="text-base font-medium">{evaluation.overallScore.toFixed(2)}</span>
                    </Space>
                </div>
            }
        >
            {/* 基本信息 */}
            <Descriptions
                column={2}
                data={[
                    {
                        label: '会话标题',
                        value: evaluation.conversationTitle,
                    },
                    {
                        label: '评估时间',
                        value: new Date(evaluation.evaluatedAt).toLocaleString('zh-CN'),
                    },
                ]}
                className="mb-6"
            />

            {/* 各维度评分 */}
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <h3 className="text-base font-semibold mb-4">📊 各维度评分</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <span className="text-sm font-medium text-gray-700">法律合规</span>
                        <Space>
                            <Tag color={getGradeColor(legalGrade)}>{legalGrade}</Tag>
                            <span className="text-sm font-semibold">{evaluation.legalScore} 分</span>
                        </Space>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <span className="text-sm font-medium text-gray-700">伦理标准</span>
                        <Space>
                            <Tag color={getGradeColor(ethicalGrade)}>{ethicalGrade}</Tag>
                            <span className="text-sm font-semibold">{evaluation.ethicalScore} 分</span>
                        </Space>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <span className="text-sm font-medium text-gray-700">专业性</span>
                        <Space>
                            <Tag color={getGradeColor(professionalGrade)}>{professionalGrade}</Tag>
                            <span className="text-sm font-semibold">{evaluation.professionalScore} 分</span>
                        </Space>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <span className="text-sm font-medium text-gray-700">用户体验</span>
                        <Space>
                            <Tag color={getGradeColor(uxGrade)}>{uxGrade}</Tag>
                            <span className="text-sm font-semibold">{evaluation.uxScore} 分</span>
                        </Space>
                    </div>
                </div>
            </div>

            {/* 发现的问题 */}
            <div className="space-y-4">
                <h3 className="text-base font-semibold">⚠️ 发现的问题</h3>
                <div className="space-y-3">
                    <IssuesList issues={evaluation.legalIssues} title="法律合规" />
                    <IssuesList issues={evaluation.ethicalIssues} title="伦理标准" />
                    <IssuesList issues={evaluation.professionalIssues} title="专业性" />
                    <IssuesList issues={evaluation.uxIssues} title="用户体验" />
                </div>
            </div>
        </Card>
    );
}
