'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input, InputNumber, Radio, Space, Message, Divider, Spin, Tag } from '@arco-design/web-react';
import { IconCheck, IconClose, IconRight } from '@arco-design/web-react/icon';
import { useSearchParams } from 'next/navigation';

const { TextArea } = Input;

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
}

interface ConvMessage {
  role: string;
  content: string;
  createdAt: string;
}

interface EvaluationDetail {
  id: string;
  conversationId: string;
  legalScore: number;
  ethicalScore: number;
  professionalScore: number;
  uxScore: number;
  legalIssues: string[];
  ethicalIssues: string[];
  professionalIssues: string[];
  uxIssues: string[];
  overallGrade: string;
  overallScore: number;
  improvements: string[];
}

// 4 个评估维度
const DIMENSIONS = [
  { key: 'legal', label: '合规性', scoreKey: 'legalScore' as const, issuesKey: 'legalIssues' as const },
  { key: 'ethical', label: '伦理性', scoreKey: 'ethicalScore' as const, issuesKey: 'ethicalIssues' as const },
  { key: 'professional', label: '专业性', scoreKey: 'professionalScore' as const, issuesKey: 'professionalIssues' as const },
  { key: 'ux', label: '用户体验', scoreKey: 'uxScore' as const, issuesKey: 'uxIssues' as const },
];

// --------------------------------------------------------------------------
// 页面组件
// --------------------------------------------------------------------------

export default function AnnotationWorkbenchPage() {
  const searchParams = useSearchParams();
  const initialTaskId = searchParams.get('taskId');

  const [task, setTask] = useState<AnnotationTask | null>(null);
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 标注状态：每个维度的同意/不同意 + 人工分数 + 备注
  const [annotations, setAnnotations] = useState<Record<string, {
    agree: boolean | null;
    score: number | null;
    note: string;
  }>>({
    legal: { agree: null, score: null, note: '' },
    ethical: { agree: null, score: null, note: '' },
    professional: { agree: null, score: null, note: '' },
    ux: { agree: null, score: null, note: '' },
  });

  // 加载任务
  const loadTask = useCallback(async (taskId?: string) => {
    setLoading(true);
    try {
      let taskData: AnnotationTask;

      if (taskId) {
        // 加载指定任务
        const res = await fetch(`/api/eval/annotation-tasks/${taskId}`);
        if (!res.ok) throw new Error('任务不存在');
        const data = await res.json();
        taskData = data.task;
      } else {
        // 获取下一个任务
        const res = await fetch('/api/eval/annotation-tasks/next');
        if (!res.ok) throw new Error('获取任务失败');
        const data = await res.json();
        if (!data.task) {
          setTask(null);
          setLoading(false);
          return;
        }
        taskData = data.task;
      }

      setTask(taskData);

      // 标记为进行中
      if (taskData.status === 'PENDING') {
        await fetch(`/api/eval/annotation-tasks/${taskData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'IN_PROGRESS' }),
        });
      }

      // 并行加载对话消息和评估详情
      await Promise.all([
        loadConversation(taskData.conversationId),
        loadEvaluation(taskData.evaluationId),
      ]);

      // 重置标注状态
      setAnnotations({
        legal: { agree: null, score: null, note: '' },
        ethical: { agree: null, score: null, note: '' },
        professional: { agree: null, score: null, note: '' },
        ux: { agree: null, score: null, note: '' },
      });
    } catch (e: any) {
      Message.error(e.message || '加载任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/eval/conversations?id=${conversationId}`);
      if (!res.ok) return;
      const data = await res.json();
      // conversations API 返回对话列表，我们要找目标对话的消息
      // 如果有 messages 字段直接用，否则可能需要从 trace API 获取
      if (data.messages) {
        setMessages(data.messages);
      } else if (data.conversations) {
        // 尝试用 trace API 获取完整消息
        const traceRes = await fetch(`/api/eval/trace?conversationId=${conversationId}&limit=1`);
        if (traceRes.ok) {
          const traceData = await traceRes.json();
          if (traceData.conversation?.messages) {
            setMessages(traceData.conversation.messages);
            return;
          }
        }
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  };

  const loadEvaluation = async (evaluationId: string) => {
    try {
      // 从 evaluations API 获取评估详情
      const res = await fetch(`/api/optimization/evaluations?page=1&pageSize=100`);
      if (!res.ok) return;
      const data = await res.json();
      const found = data.evaluations?.find((e: any) => e.id === evaluationId);
      if (found) {
        setEvaluation({
          id: found.id,
          conversationId: found.conversationId,
          legalScore: found.legalScore ?? 0,
          ethicalScore: found.ethicalScore ?? 0,
          professionalScore: found.professionalScore ?? 0,
          uxScore: found.uxScore ?? 0,
          legalIssues: found.legalIssues ?? [],
          ethicalIssues: found.ethicalIssues ?? [],
          professionalIssues: found.professionalIssues ?? [],
          uxIssues: found.uxIssues ?? [],
          overallGrade: found.overallGrade ?? '-',
          overallScore: found.overallScore ?? 0,
          improvements: found.improvements ?? [],
        });
      }
    } catch {
      setEvaluation(null);
    }
  };

  useEffect(() => {
    loadTask(initialTaskId || undefined);
  }, [initialTaskId, loadTask]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !submitting && task) {
        e.preventDefault();
        handleSubmitAndNext();
      }
      if (e.key === 'Escape' && task) {
        handleSkip();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [task, submitting, annotations]);

  // 更新维度标注
  const updateAnnotation = (dim: string, field: string, value: any) => {
    setAnnotations(prev => ({
      ...prev,
      [dim]: { ...prev[dim], [field]: value },
    }));
  };

  // 提交标注并进入下一个
  const handleSubmitAndNext = async () => {
    if (!task) return;
    setSubmitting(true);
    try {
      // 构建标注备注
      const noteLines: string[] = [];
      for (const dim of DIMENSIONS) {
        const ann = annotations[dim.key];
        if (ann.agree !== null || ann.score !== null || ann.note) {
          noteLines.push(
            `[${dim.label}] 同意:${ann.agree === null ? '未选' : ann.agree ? '是' : '否'} ` +
            `人工分:${ann.score ?? '-'} 备注:${ann.note || '无'}`
          );
        }
      }

      // 完成当前任务
      await fetch(`/api/eval/annotation-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETED',
          notes: noteLines.join('\n') || '已标注',
        }),
      });

      Message.success('标注已提交');

      // 加载下一个任务
      await loadTask();
    } catch (e) {
      Message.error('提交标注失败');
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  // 跳过当前任务
  const handleSkip = async () => {
    if (!task) return;
    try {
      await fetch(`/api/eval/annotation-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SKIPPED' }),
      });
      Message.info('已跳过');
      await loadTask();
    } catch {
      Message.error('跳过失败');
    }
  };

  // 加载中
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spin size={40} tip="加载标注任务..." />
      </div>
    );
  }

  // 没有任务
  if (!task) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="text-4xl mb-4">&#10003;</div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">所有任务已完成</h2>
        <p className="text-gray-500 mb-6">当前没有待标注的任务</p>
        <Button
          type="primary"
          onClick={() => window.location.href = '/dashboard/optimization/annotation-queue'}
        >
          返回任务列表
        </Button>
      </div>
    );
  }

  const priorityInfo = { 0: { text: '普通', color: 'gray' }, 1: { text: '高优', color: 'orange' }, 2: { text: '紧急', color: 'red' } }[task.priority] || { text: '普通', color: 'gray' };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      {/* 顶部信息栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button
            size="small"
            onClick={() => window.location.href = '/dashboard/optimization/annotation-queue'}
          >
            返回列表
          </Button>
          <Tag color={priorityInfo.color}>{priorityInfo.text}</Tag>
          <span className="text-sm text-gray-500 font-mono">
            任务 {task.id.slice(0, 8)}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          Enter: 提交并下一个 | Escape: 跳过
        </div>
      </div>

      {/* 三栏布局 */}
      <div className="grid grid-cols-12 gap-4" style={{ minHeight: 'calc(100vh - 140px)' }}>
        {/* 左栏：对话内容 */}
        <div className="col-span-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          <Card title="对话内容" size="small" className="h-full">
            {messages.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                暂无对话消息
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <div className="whitespace-pre-wrap wrap-break-word">{msg.content}</div>
                      <div className={`text-[10px] mt-1 ${
                        msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                      }`}>
                        {msg.role === 'user' ? '用户' : '助手'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* 中栏：评估详情 */}
        <div className="col-span-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          <Card title="LLM 评估详情" size="small" className="h-full">
            {!evaluation ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                暂无评估数据
              </div>
            ) : (
              <div className="space-y-4">
                {/* 总分 */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">总分</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{evaluation.overallScore.toFixed(1)}</span>
                    <Tag color={
                      evaluation.overallGrade === 'A' ? 'green' :
                      evaluation.overallGrade === 'B' ? 'blue' :
                      evaluation.overallGrade === 'C' ? 'gold' :
                      evaluation.overallGrade === 'D' ? 'orange' : 'red'
                    }>
                      {evaluation.overallGrade}
                    </Tag>
                  </div>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* 4 维度分数 */}
                {DIMENSIONS.map(dim => {
                  const score = evaluation[dim.scoreKey] as number;
                  const issues = evaluation[dim.issuesKey] as string[];
                  return (
                    <div key={dim.key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{dim.label}</span>
                        <span className={`text-sm font-bold ${
                          score >= 7 ? 'text-green-600' :
                          score >= 4 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {score}/10
                        </span>
                      </div>
                      {issues.length > 0 && (
                        <ul className="text-xs text-gray-500 pl-4 space-y-0.5">
                          {issues.map((issue, j) => (
                            <li key={j} className="list-disc">{issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}

                <Divider style={{ margin: '8px 0' }} />

                {/* 改进建议 */}
                {evaluation.improvements.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">改进建议</div>
                    <ul className="text-xs text-gray-600 pl-4 space-y-1">
                      {evaluation.improvements.map((item, i) => (
                        <li key={i} className="list-decimal">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* 右栏：标注控件 */}
        <div className="col-span-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          <Card title="人工标注" size="small" className="h-full">
            <div className="space-y-5">
              {DIMENSIONS.map(dim => {
                const ann = annotations[dim.key];
                return (
                  <div key={dim.key} className="space-y-2">
                    <div className="text-sm font-medium">{dim.label}</div>

                    {/* 同意/不同意 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16">是否同意:</span>
                      <Radio.Group
                        size="small"
                        type="button"
                        value={ann.agree === null ? undefined : ann.agree ? 'agree' : 'disagree'}
                        onChange={(val) => updateAnnotation(dim.key, 'agree', val === 'agree')}
                      >
                        <Radio value="agree">
                          <IconCheck className="mr-1" />同意
                        </Radio>
                        <Radio value="disagree">
                          <IconClose className="mr-1" />不同意
                        </Radio>
                      </Radio.Group>
                    </div>

                    {/* 人工分数 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16">人工分数:</span>
                      <InputNumber
                        size="small"
                        min={0}
                        max={10}
                        step={1}
                        value={ann.score ?? undefined}
                        placeholder="0-10"
                        onChange={(val) => updateAnnotation(dim.key, 'score', val ?? null)}
                        style={{ width: 100 }}
                      />
                    </div>

                    {/* 备注 */}
                    <TextArea
                      placeholder="标注备注（可选）"
                      value={ann.note}
                      onChange={(val) => updateAnnotation(dim.key, 'note', val)}
                      autoSize={{ minRows: 1, maxRows: 3 }}
                    />

                    <Divider style={{ margin: '4px 0' }} />
                  </div>
                );
              })}

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="primary"
                  long
                  loading={submitting}
                  icon={<IconCheck />}
                  onClick={handleSubmitAndNext}
                >
                  提交并下一个
                </Button>
                <Button
                  type="secondary"
                  long
                  icon={<IconRight />}
                  onClick={handleSkip}
                >
                  跳过
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
