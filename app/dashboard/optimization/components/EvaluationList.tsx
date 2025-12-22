'use client';

import { Table, Tag } from '@arco-design/web-react';
import { IconCheck, IconClose, IconClockCircle } from '@arco-design/web-react/icon';

export interface Evaluation {
    id: string;
    conversationId: string;
    conversationTitle: string;
    evaluatedAt: string;
    overallGrade: string;
    overallScore: number;
    legalScore: number;
    legalIssues: string[];
    ethicalScore: number;
    ethicalIssues: string[];
    professionalScore: number;
    professionalIssues: string[];
    uxScore: number;
    uxIssues: string[];
    improvements?: string[];
    reviewStatus?: string;
    reviewedAt?: string;
    reviewNote?: string;
}

interface EvaluationListProps {
    evaluations: Evaluation[];
    loading?: boolean;
    selectedRowKeys?: string[];
    onSelectionChange?: (keys: string[]) => void;
    onRowClick?: (evaluation: Evaluation) => void;
}

function getGradeColor(grade: string): string {
    if (grade === 'EVALUATING') return 'gray';
    if (grade === 'FAILED') return 'red';

    const gradeMap: Record<string, string> = {
        A: 'green',
        B: 'arcoblue',
        C: 'gold',
        D: 'orange',
        F: 'red',
    };
    return gradeMap[grade] || 'gray';
}

function getStatusTag(status?: string) {
    switch (status) {
        case 'ADOPTED':
            return <Tag color="green" icon={<IconCheck />}>已采纳</Tag>;
        case 'REJECTED':
            return <Tag color="red" icon={<IconClose />}>已驳回</Tag>;
        case 'PENDING':
        default:
            return <Tag color="gray" icon={<IconClockCircle />}>待审核</Tag>;
    }
}

function formatTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;

    return date.toLocaleDateString('zh-CN');
}

export default function EvaluationList({
    evaluations,
    loading = false,
    selectedRowKeys = [],
    onSelectionChange,
    onRowClick,
}: EvaluationListProps) {
    const columns = [
        {
            title: '会话标题',
            dataIndex: 'conversationTitle',
            width: 220,
            render: (title: string) => (
                <div className="truncate cursor-pointer hover:text-blue-600" title={title}>
                    {title}
                </div>
            ),
        },
        {
            title: '评估时间',
            dataIndex: 'evaluatedAt',
            width: 100,
            render: (time: string) => formatTime(time),
        },
        {
            title: '等级',
            dataIndex: 'overallGrade',
            width: 80,
            render: (grade: string) => (
                <Tag color={getGradeColor(grade)} style={{ fontSize: '14px' }}>
                    {grade === 'EVALUATING' ? '待评估' : grade === 'FAILED' ? '失败' : grade}
                </Tag>
            ),
        },
        {
            title: '法律',
            dataIndex: 'legalScore',
            width: 50,
            render: (score: number, record: Evaluation) =>
                record.overallGrade === 'EVALUATING' ? '-' : `${score}`,
        },
        {
            title: '伦理',
            dataIndex: 'ethicalScore',
            width: 50,
            render: (score: number, record: Evaluation) =>
                record.overallGrade === 'EVALUATING' ? '-' : `${score}`,
        },
        {
            title: '专业',
            dataIndex: 'professionalScore',
            width: 50,
            render: (score: number, record: Evaluation) =>
                record.overallGrade === 'EVALUATING' ? '-' : `${score}`,
        },
        {
            title: 'UX',
            dataIndex: 'uxScore',
            width: 40,
            render: (score: number, record: Evaluation) =>
                record.overallGrade === 'EVALUATING' ? '-' : `${score}`,
        },
        {
            title: '总分',
            dataIndex: 'overallScore',
            width: 60,
            render: (score: number, record: Evaluation) =>
                record.overallGrade === 'EVALUATING' ? '-' : (
                    <span className="font-medium">{score.toFixed(1)}</span>
                ),
        },
        {
            title: '审核',
            dataIndex: 'reviewStatus',
            width: 80,
            render: (status: string | undefined, record: Evaluation) =>
                record.overallGrade === 'EVALUATING' ? '-' : getStatusTag(status),
        },
    ];

    return (
        <Table
            loading={loading}
            columns={columns}
            data={evaluations}
            rowKey="id"
            pagination={false}
            scroll={{ x: 900 }}
            className="shadow-md rounded-lg"
            onRow={(record) => ({
                onClick: () => onRowClick?.(record),
                style: { cursor: 'pointer' },
            })}
            rowSelection={onSelectionChange ? {
                type: 'checkbox',
                selectedRowKeys,
                onChange: (keys) => onSelectionChange(keys as string[]),
            } : undefined}
        />
    );
}
