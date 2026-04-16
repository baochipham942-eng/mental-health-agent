'use client';

import { Modal, Tag, Button, Message, Divider, Space, Tabs, Spin, Input, InputNumber, Tooltip } from '@arco-design/web-react';
import { IconCheck, IconClose, IconUndo, IconThumbUp, IconThumbDown } from '@arco-design/web-react/icon';
import { useState, useEffect, useCallback } from 'react';
import DimensionRadar from './DimensionRadar';

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
    feedback?: {
        rating: number; // 1 = thumbs up, -1 = thumbs down
        reason?: string;
    } | null;
}

interface Annotation {
    id: string;
    evaluationId: string;
    dimension: string;
    agree: boolean;
    humanScore: number | null;
    note: string | null;
    annotatedBy: string;
    annotatedAt: string;
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

type DimensionKey = 'legal' | 'ethical' | 'professional' | 'ux' | 'overall';

// ---------- 标注交互组件 ----------

interface AnnotationControlProps {
    dimension: DimensionKey;
    aiScore: number;
    annotation: Annotation | undefined;
    saving: boolean;
    onSave: (dimension: DimensionKey, agree: boolean, humanScore?: number, note?: string) => void;
}

function AnnotationControl({ dimension, aiScore, annotation, saving, onSave }: AnnotationControlProps) {
    const [expanded, setExpanded] = useState(false);
    const [humanScore, setHumanScore] = useState<number | undefined>(undefined);
    const [note, setNote] = useState('');

    // 同步已有标注数据
    useEffect(() => {
        if (annotation) {
            setHumanScore(annotation.humanScore ?? undefined);
            setNote(annotation.note ?? '');
            if (!annotation.agree) setExpanded(true);
        } else {
            setHumanScore(undefined);
            setNote('');
            setExpanded(false);
        }
    }, [annotation]);

    const handleAgree = () => {
        onSave(dimension, true);
        setExpanded(false);
    };

    const handleDisagree = () => {
        setExpanded(true);
    };

    const handleSaveDisagree = () => {
        onSave(dimension, false, humanScore, note || undefined);
    };

    const hasAnnotation = !!annotation;
    const isAgreed = annotation?.agree === true;
    const isDisagreed = annotation?.agree === false;

    return (
        <div>
            <div className="flex items-center gap-2">
                {/* 标注状态指示 */}
                {hasAnnotation && (
                    <Tooltip content={isAgreed ? '已同意 AI 评分' : `不同意，修正为 ${annotation?.humanScore ?? '-'} 分`}>
                        <Tag size="small" color={isAgreed ? 'green' : 'red'} className="text-xs">
                            {isAgreed ? (
                                <><IconCheck className="mr-0.5" />同意</>
                            ) : (
                                <><IconClose className="mr-0.5" />{annotation?.humanScore ?? '-'}</>
                            )}
                        </Tag>
                    </Tooltip>
                )}
                {/* 操作按钮 */}
                <Tooltip content="同意 AI 评分">
                    <Button
                        size="mini"
                        shape="circle"
                        type={isAgreed ? 'primary' : 'secondary'}
                        status={isAgreed ? 'success' : undefined}
                        icon={<IconThumbUp />}
                        loading={saving}
                        onClick={handleAgree}
                    />
                </Tooltip>
                <Tooltip content="不同意 AI 评分">
                    <Button
                        size="mini"
                        shape="circle"
                        type={isDisagreed ? 'primary' : 'secondary'}
                        status={isDisagreed ? 'danger' : undefined}
                        icon={<IconThumbDown />}
                        loading={saving}
                        onClick={handleDisagree}
                    />
                </Tooltip>
            </div>
            {/* 不同意时展开的修正区域 */}
            {expanded && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">修正分:</span>
                    <InputNumber
                        size="mini"
                        min={0}
                        max={10}
                        step={1}
                        style={{ width: 72 }}
                        placeholder={String(aiScore)}
                        value={humanScore}
                        onChange={(v) => setHumanScore(v)}
                    />
                    <Input
                        size="mini"
                        style={{ width: 160 }}
                        placeholder="备注（可选）"
                        value={note}
                        onChange={setNote}
                    />
                    <Button size="mini" type="primary" loading={saving} onClick={handleSaveDisagree}>
                        保存
                    </Button>
                </div>
            )}
        </div>
    );
}

// ---------- ScoreCard（含标注） ----------

function ScoreCard({
    dimension,
    title,
    score,
    issues,
    annotation,
    saving,
    onAnnotate,
}: {
    dimension: DimensionKey;
    title: string;
    score: number;
    issues: string[];
    annotation: Annotation | undefined;
    saving: boolean;
    onAnnotate: (dimension: DimensionKey, agree: boolean, humanScore?: number, note?: string) => void;
}) {
    const getScoreColor = (s: number) => {
        if (s >= 9) return 'text-green-600';
        if (s >= 7) return 'text-blue-600';
        if (s >= 5) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-gray-700">{title}</span>
                <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
                </div>
            </div>
            {/* 标注控件 */}
            <div className="mb-2">
                <AnnotationControl
                    dimension={dimension}
                    aiScore={score}
                    annotation={annotation}
                    saving={saving}
                    onSave={onAnnotate}
                />
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

    // 标注状态
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [savingAnnotation, setSavingAnnotation] = useState(false);

    // 加载对话记录 + 标注
    useEffect(() => {
        if (visible && evaluation?.conversationId) {
            loadMessages(evaluation.conversationId);
            setPromptOptimization(generateOptimizedPrompt(evaluation.improvements || []));
        }
        if (visible && evaluation?.id) {
            loadAnnotations(evaluation.id);
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

    const loadAnnotations = useCallback(async (evaluationId: string) => {
        try {
            const res = await fetch(`/api/eval/annotations?evaluationId=${evaluationId}`);
            if (res.ok) {
                const data = await res.json();
                setAnnotations(data.annotations || []);
            }
        } catch (error) {
            console.error('Load annotations failed:', error);
        }
    }, []);

    const handleAnnotate = useCallback(async (dimension: DimensionKey, agree: boolean, humanScore?: number, note?: string) => {
        if (!evaluation) return;
        setSavingAnnotation(true);
        try {
            const res = await fetch('/api/eval/annotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    evaluationId: evaluation.id,
                    dimension,
                    agree,
                    humanScore: humanScore ?? null,
                    note: note ?? null,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setAnnotations(data.annotations || []);
                Message.success('标注已保存');
            } else {
                const err = await res.json();
                Message.error(`标注失败: ${err.error}`);
            }
        } catch {
            Message.error('标注失败');
        } finally {
            setSavingAnnotation(false);
        }
    }, [evaluation]);

    if (!evaluation) return null;

    const isEvaluating = evaluation.overallGrade === 'EVALUATING';
    const reviewStatus = evaluation.reviewStatus || 'PENDING';

    // 按 dimension 索引标注
    const annotationMap = new Map(annotations.map(a => [a.dimension, a]));
    const allDimensions: DimensionKey[] = ['legal', 'ethical', 'professional', 'ux', 'overall'];
    const annotatedCount = annotations.length;
    const agreedCount = annotations.filter(a => a.agree).length;
    const disagreedCount = annotations.filter(a => !a.agree).length;

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
            style={{ width: 960, maxWidth: '95vw' }}
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
                <div className="flex justify-between items-center pb-3 border-b border-gray-200 shrink-0">
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
                                    <div className="flex gap-4">
                                        <div className="shrink-0 flex flex-col items-center justify-center">
                                            <DimensionRadar
                                                scores={{
                                                    legal: evaluation.legalScore,
                                                    ethical: evaluation.ethicalScore,
                                                    professional: evaluation.professionalScore,
                                                    ux: evaluation.uxScore,
                                                }}
                                                size={180}
                                            />
                                        </div>
                                    <div className="flex-1 grid grid-cols-2 gap-4">
                                        <ScoreCard
                                            dimension="legal"
                                            title="法律合规性"
                                            score={evaluation.legalScore}
                                            issues={evaluation.legalIssues || []}
                                            annotation={annotationMap.get('legal')}
                                            saving={savingAnnotation}
                                            onAnnotate={handleAnnotate}
                                        />
                                        <ScoreCard
                                            dimension="ethical"
                                            title="伦理规范"
                                            score={evaluation.ethicalScore}
                                            issues={evaluation.ethicalIssues || []}
                                            annotation={annotationMap.get('ethical')}
                                            saving={savingAnnotation}
                                            onAnnotate={handleAnnotate}
                                        />
                                        <ScoreCard
                                            dimension="professional"
                                            title="专业性"
                                            score={evaluation.professionalScore}
                                            issues={evaluation.professionalIssues || []}
                                            annotation={annotationMap.get('professional')}
                                            saving={savingAnnotation}
                                            onAnnotate={handleAnnotate}
                                        />
                                        <ScoreCard
                                            dimension="ux"
                                            title="用户体验"
                                            score={evaluation.uxScore}
                                            issues={evaluation.uxIssues || []}
                                            annotation={annotationMap.get('ux')}
                                            saving={savingAnnotation}
                                            onAnnotate={handleAnnotate}
                                        />
                                    </div>
                                    </div>

                                    {/* 整体评分标注 */}
                                    <div className="mt-4 bg-gray-50 rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-medium text-gray-700">整体评分</span>
                                            <span className="text-2xl font-bold text-gray-900">{evaluation.overallScore.toFixed(1)}</span>
                                        </div>
                                        <AnnotationControl
                                            dimension="overall"
                                            aiScore={evaluation.overallScore}
                                            annotation={annotationMap.get('overall')}
                                            saving={savingAnnotation}
                                            onSave={handleAnnotate}
                                        />
                                    </div>

                                    {/* 标注统计 */}
                                    {annotatedCount > 0 && (
                                        <div className="mt-4 text-sm text-gray-500 text-center">
                                            已标注 {annotatedCount}/{allDimensions.length} 个维度，
                                            <span className="text-green-600">{agreedCount} 个同意</span>
                                            {disagreedCount > 0 && (
                                                <span>，<span className="text-red-600">{disagreedCount} 个不同意</span></span>
                                            )}
                                        </div>
                                    )}
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
                                                                        <span className="w-3 h-3 rounded-sm bg-yellow-400"></span>
                                                                        <span className="text-gray-600">修改内容</span>
                                                                    </span>
                                                                    <span className="flex items-center gap-1">
                                                                        <span className="w-3 h-3 rounded-sm bg-green-400"></span>
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
                                    {/* 对话统计 */}
                                    {messages.length > 0 && (
                                        <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                                            <span>📊 <strong>{messages.length}</strong> 条消息</span>
                                            <span>🔄 <strong>{messages.filter(m => m.role === 'user').length}</strong> 轮对话</span>
                                            <span>👍 <strong>{messages.filter(m => m.feedback?.rating === 1).length}</strong> 点赞</span>
                                            <span>👎 <strong>{messages.filter(m => m.feedback?.rating === -1).length}</strong> 点踩</span>
                                        </div>
                                    )}
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
                                                            {/* Feedback indicator for AI messages */}
                                                            {msg.role === 'assistant' && msg.feedback && (
                                                                <span
                                                                    className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${msg.feedback.rating === 1
                                                                        ? 'bg-green-100 text-green-700'
                                                                        : 'bg-red-100 text-red-700'
                                                                        }`}
                                                                    title={msg.feedback.reason || undefined}
                                                                >
                                                                    {msg.feedback.rating === 1 ? '👍' : '👎'}
                                                                    {msg.feedback.reason && ` ${msg.feedback.reason}`}
                                                                </span>
                                                            )}
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
