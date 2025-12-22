'use client';

import { Modal, Tag, Button, Message, Divider, Space, Tabs, Spin, Input } from '@arco-design/web-react';
import { IconCheck, IconClose, IconUndo } from '@arco-design/web-react/icon';
import { useState, useEffect } from 'react';

const TabPane = Tabs.TabPane;

export interface EvaluationDetail {
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

interface ConversationMessage {
    id: string;
    role: string;
    content: string;
    createdAt: string;
}

interface EvaluationDetailModalProps {
    visible: boolean;
    evaluation: EvaluationDetail | null;
    onClose: () => void;
    onAdopted?: () => void;
}

function getGradeColor(grade: string): string {
    const gradeMap: Record<string, string> = {
        A: 'green',
        B: 'arcoblue',
        C: 'gold',
        D: 'orange',
        F: 'red',
        EVALUATING: 'gray',
    };
    return gradeMap[grade] || 'gray';
}

function ScoreCard({ title, score, issues }: { title: string; score: number; issues: string[] }) {
    const getScoreColor = (s: number) => {
        if (s >= 9) return 'text-green-600';
        if (s >= 7) return 'text-blue-600';
        if (s >= 5) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-gray-700">{title}</span>
                <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
            </div>
            {issues.length > 0 ? (
                <div className="space-y-1">
                    {issues.map((issue, i) => (
                        <div key={i} className="text-sm text-gray-600 flex items-start">
                            <span className="text-red-500 mr-1">•</span>
                            {issue}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-sm text-green-600">✓ 无问题</div>
            )}
        </div>
    );
}

// 原始 System Prompt
const SYSTEM_PROMPT_SECTIONS = {
    identity: {
        name: 'Identity & Style',
        content: `你是专业的 AI 心理咨询师，擅长认知行为疗法（CBT）。
风格要求：专业、温暖、中性。每次回复控制在 3-5 句以内。始终使用第二人称"你"。`,
    },
};

interface PromptSegment {
    text: string;
    type: 'original' | 'modified' | 'added';
}

function generateOptimizedPrompt(improvements: string[]): {
    sectionName: string;
    original: string;
    segments: PromptSegment[];
    changes: { type: 'add' | 'modify'; content: string }[];
} | null {
    if (!improvements || improvements.length === 0) return null;

    const section = SYSTEM_PROMPT_SECTIONS.identity;
    const originalContent = section.content;
    const segments: PromptSegment[] = [];
    const changes: { type: 'add' | 'modify'; content: string }[] = [];
    const additions: string[] = [];

    // 处理修改
    let modifiedBase = originalContent;
    let hasLengthChange = false;

    improvements.forEach(imp => {
        if (imp.includes('回复') && (imp.includes('简洁') || imp.includes('句'))) {
            hasLengthChange = true;
            changes.push({ type: 'modify', content: '回复长度从 3-5 句改为 3-4 句' });
        }
        if (imp.includes('AI局限性') || imp.includes('AI的局限性')) {
            additions.push('**AI 身份声明**：在首轮回复中自然地表明身份，例如："作为 AI 助手，我会尽力陪伴和支持你。"');
            changes.push({ type: 'add', content: '新增 AI 身份声明（温和版）' });
        }
        if (imp.includes('共情') && (imp.includes('重复') || imp.includes('多样化'))) {
            additions.push('- 共情表达多样化：避免重复使用"我理解"、"我听到了"，可使用"这一定让你感到..."、"听起来..."等多种表达。');
            changes.push({ type: 'add', content: '新增共情表达多样化要求' });
        }
        if (imp.includes('专业帮助') || imp.includes('严重情况')) {
            additions.push('- 当用户表现出持续严重症状（如失眠超过2周）时，主动建议寻求专业心理咨询师帮助。');
            changes.push({ type: 'add', content: '新增专业帮助建议规则' });
        }
    });

    if (changes.length === 0) return null;

    // 构建带标记的segments
    if (hasLengthChange) {
        // 分割原文，标记修改部分
        const parts = modifiedBase.split('3-5 句');
        if (parts.length === 2) {
            segments.push({ text: parts[0], type: 'original' });
            segments.push({ text: '3-4 句', type: 'modified' });
            segments.push({ text: parts[1], type: 'original' });
        } else {
            segments.push({ text: modifiedBase, type: 'original' });
        }
    } else {
        segments.push({ text: modifiedBase, type: 'original' });
    }

    // 添加新增内容
    additions.forEach(add => {
        segments.push({ text: '\n\n', type: 'original' });
        segments.push({ text: add, type: 'added' });
    });

    return {
        sectionName: 'System Prompt - Identity & Style',
        original: originalContent,
        segments,
        changes,
    };
}


export default function EvaluationDetailModal({
    visible,
    evaluation,
    onClose,
    onAdopted,
}: EvaluationDetailModalProps) {
    const [adopting, setAdopting] = useState(false);
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [promptOptimization, setPromptOptimization] = useState<ReturnType<typeof generateOptimizedPrompt>>(null);

    // 加载对话记录
    useEffect(() => {
        if (visible && evaluation?.conversationId) {
            loadMessages(evaluation.conversationId);
            setPromptOptimization(generateOptimizedPrompt(evaluation.improvements || []));
        }
    }, [visible, evaluation]);

    const loadMessages = async (conversationId: string) => {
        setLoadingMessages(true);
        try {
            const res = await fetch(`/api/conversations/${conversationId}/messages`);
            if (res.ok) {
                const data = await res.json();
                setMessages(data.messages || []);
            }
        } catch (error) {
            console.error('Load messages failed:', error);
        } finally {
            setLoadingMessages(false);
        }
    };

    if (!evaluation) return null;

    const isEvaluating = evaluation.overallGrade === 'EVALUATING';
    const reviewStatus = evaluation.reviewStatus || 'PENDING';

    const handleReview = async (action: 'adopt' | 'reject' | 'revoke', note?: string) => {
        setAdopting(true);
        try {
            const res = await fetch('/api/optimization/review-improvement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ evaluationId: evaluation.id, action, note }),
            });

            if (res.ok) {
                const msgs = { adopt: '已采纳', reject: '已驳回', revoke: '已撤回' };
                Message.success(msgs[action]);
                onAdopted?.();
                onClose();
            } else {
                const error = await res.json();
                Message.error(`操作失败: ${error.error}`);
            }
        } catch (error) {
            Message.error('操作失败');
        } finally {
            setAdopting(false);
        }
    };

    const getStatusTag = () => {
        switch (reviewStatus) {
            case 'ADOPTED': return <Tag color="green"><IconCheck /> 已采纳</Tag>;
            case 'REJECTED': return <Tag color="red"><IconClose /> 已驳回</Tag>;
            default: return <Tag color="gray">待审核</Tag>;
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <span>评估详情</span>
                    <Tag color={getGradeColor(evaluation.overallGrade)} style={{ fontSize: '14px' }}>
                        {isEvaluating ? '待评估' : `${evaluation.overallGrade} (${evaluation.overallScore.toFixed(1)})`}
                    </Tag>
                    {!isEvaluating && getStatusTag()}
                </div>
            }
            visible={visible}
            onCancel={onClose}
            style={{ width: 1000 }}
            className="evaluation-detail-modal"
            wrapClassName="flex items-center justify-center"
            footer={
                <Space>
                    <Button onClick={onClose}>关闭</Button>
                    {!isEvaluating && (
                        <>
                            {reviewStatus === 'PENDING' && (
                                <>
                                    <Button status="danger" icon={<IconClose />} loading={adopting} onClick={() => handleReview('reject')}>
                                        驳回
                                    </Button>
                                    <Button type="primary" icon={<IconCheck />} loading={adopting} onClick={() => handleReview('adopt')}>
                                        采纳
                                    </Button>
                                </>
                            )}
                            {(reviewStatus === 'ADOPTED' || reviewStatus === 'REJECTED') && (
                                <Button icon={<IconUndo />} loading={adopting} onClick={() => handleReview('revoke')}>
                                    撤回
                                </Button>
                            )}
                        </>
                    )}
                </Space>
            }
        >
            {/* 固定高度的内容容器 */}
            <div style={{ height: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column' }}>
                {/* 顶部：基本会话信息（固定） */}
                <div className="flex justify-between items-center pb-3 border-b border-gray-200 flex-shrink-0">
                    <div>
                        <div className="text-sm text-gray-500">会话标题</div>
                        <div className="font-medium text-gray-900 text-lg">{evaluation.conversationTitle}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-gray-500">评估时间</div>
                        <div className="font-medium text-gray-900">
                            {new Date(evaluation.evaluatedAt).toLocaleString('zh-CN')}
                        </div>
                    </div>
                </div>

                {/* 中间内容区域（可滚动） */}
                <div className="flex-1 overflow-y-auto mt-4">
                    {isEvaluating ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>该会话尚未评估，请先执行批量评估</p>
                        </div>
                    ) : (
                        <Tabs defaultActiveTab="scores" type="card-gutter">
                            {/* Tab 1: LLM 打分 */}
                            <TabPane key="scores" title="📊 LLM 打分">
                                <div className="p-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <ScoreCard title="法律合规性" score={evaluation.legalScore} issues={evaluation.legalIssues || []} />
                                        <ScoreCard title="伦理规范" score={evaluation.ethicalScore} issues={evaluation.ethicalIssues || []} />
                                        <ScoreCard title="专业性" score={evaluation.professionalScore} issues={evaluation.professionalIssues || []} />
                                        <ScoreCard title="用户体验" score={evaluation.uxScore} issues={evaluation.uxIssues || []} />
                                    </div>
                                </div>
                            </TabPane>

                            {/* Tab 2: 改进建议 */}
                            <TabPane key="improvements" title="💡 改进建议">
                                <div className="p-4 space-y-6">
                                    {/* 改进建议列表 */}
                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-3">📝 建议内容</h4>
                                        {evaluation.improvements && evaluation.improvements.length > 0 ? (
                                            <div className="space-y-2">
                                                {evaluation.improvements.map((item, i) => (
                                                    <div key={i} className="flex items-start p-3 bg-blue-50 rounded-lg">
                                                        <span className="text-blue-500 font-medium mr-2">{i + 1}.</span>
                                                        <span className="text-gray-700">{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500">暂无改进建议</p>
                                        )}
                                    </div>

                                    {/* Prompt 修改 */}
                                    {promptOptimization && (
                                        <>
                                            <Divider />
                                            <div>
                                                <h4 className="font-medium text-gray-900 mb-3">
                                                    🔧 Prompt 修改预览
                                                    <Tag color="purple" className="ml-2">{promptOptimization.sectionName}</Tag>
                                                </h4>

                                                <div className="space-y-4">
                                                    {/* 修改摘要 */}
                                                    <div className="bg-gray-50 rounded-lg p-4">
                                                        <div className="text-sm font-medium text-gray-700 mb-2">修改点：</div>
                                                        {promptOptimization.changes.map((c, i) => (
                                                            <div key={i} className={`text-sm py-1 ${c.type === 'add' ? 'text-green-700' : 'text-yellow-700'}`}>
                                                                {c.type === 'add' ? '+ ' : '~ '}{c.content}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* 原始/修改后对比 */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-700 mb-2">📄 原始 Prompt</div>
                                                            <div className="bg-gray-900 text-gray-100 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap h-48 overflow-y-auto">
                                                                {promptOptimization.original}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="text-sm font-medium text-gray-700">✨ 修改后 Prompt</div>
                                                                <div className="flex gap-3 text-xs">
                                                                    <span className="flex items-center gap-1">
                                                                        <span className="w-3 h-3 rounded bg-yellow-400"></span>
                                                                        <span className="text-gray-600">修改内容</span>
                                                                    </span>
                                                                    <span className="flex items-center gap-1">
                                                                        <span className="w-3 h-3 rounded bg-green-400"></span>
                                                                        <span className="text-gray-600">新增内容</span>
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap h-48 overflow-y-auto">
                                                                {promptOptimization.segments.map((seg, i) => (
                                                                    <span
                                                                        key={i}
                                                                        className={
                                                                            seg.type === 'added' ? 'text-green-400 bg-green-900/30' :
                                                                                seg.type === 'modified' ? 'text-yellow-400 bg-yellow-900/30' :
                                                                                    'text-gray-100'
                                                                        }
                                                                    >
                                                                        {seg.text}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {reviewStatus === 'ADOPTED' && evaluation.reviewedAt && (
                                        <div className="text-center text-green-600 text-sm mt-4">
                                            ✓ 已于 {new Date(evaluation.reviewedAt).toLocaleString('zh-CN')} 采纳
                                        </div>
                                    )}
                                    {reviewStatus === 'REJECTED' && (
                                        <div className="text-center text-red-600 text-sm mt-4">
                                            ✗ 已驳回 {evaluation.reviewNote && `- ${evaluation.reviewNote}`}
                                        </div>
                                    )}
                                </div>
                            </TabPane>

                            {/* Tab 3: 原始对话 */}
                            <TabPane key="conversation" title="💬 原始对话">
                                <div className="p-4">
                                    {loadingMessages ? (
                                        <div className="text-center py-8"><Spin /></div>
                                    ) : messages.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500">暂无对话记录</div>
                                    ) : (
                                        <div className="space-y-4">
                                            {messages.map((msg, i) => (
                                                <div
                                                    key={msg.id || i}
                                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                                >
                                                    <div
                                                        className={`max-w-[80%] rounded-lg p-3 ${msg.role === 'user'
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-gray-100 text-gray-900'
                                                            }`}
                                                    >
                                                        <div className="text-xs opacity-70 mb-1">
                                                            {msg.role === 'user' ? '👤 用户' : '🤖 AI'} · {new Date(msg.createdAt).toLocaleTimeString('zh-CN')}
                                                        </div>
                                                        <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </TabPane>
                        </Tabs>
                    )}
                </div>
            </div>
        </Modal>
    );
}

