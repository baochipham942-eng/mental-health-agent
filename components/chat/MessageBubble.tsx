'use client';


import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { Message } from '@/types/chat';
import { Message as Toast } from '@arco-design/web-react';
import { IconThumbUp, IconThumbDown, IconThumbUpFill, IconThumbDownFill } from '@arco-design/web-react/icon';
import { formatTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { ConclusionSections } from './ConclusionSections';
import { QuickReplies, detectQuickReplyMode } from './QuickReplies';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/store/chatStore';
import { ResourceCard } from './ResourceCard';
import { ActionCardGrid } from './ActionCardGrid';
import { parseThoughtTags, stripDuplicateFollowupText } from './message-utils';

interface MessageBubbleProps {
  message: Message;
  routeType?: 'crisis' | 'assessment' | 'support';
  assessmentStage?: 'intake' | 'gap_followup' | 'conclusion';
  actionCards?: any[];
  assistantQuestions?: string[];
  validationError?: {
    actionCards?: string;
    nextStepsLines?: string;
  };
  onSendMessage?: (text: string) => void;
  isSending?: boolean;
  toolCalls?: any[];
  sessionId: string;
}

export function MessageBubble({
  message,
  routeType,
  assessmentStage,
  actionCards,
  assistantQuestions,
  validationError,
  onSendMessage,
  isSending = false,
  toolCalls,
  sessionId,
}: MessageBubbleProps) {
  const router = useRouter();
  const { currentState, isLoading } = useChatStore();
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = message.role === 'user';

  // 检测是否是占位符消息（正在等待AI回复）
  const isPlaceholderMessage = !isUser && (message.content?.includes('让我整理一下思绪') || message.content?.includes('正在深入思考...'));

  // 解析并分离 <thought> 标签内容（AI内部思考过程）
  const { displayContent, thoughtContent } = parseThoughtTags(message.content || '');

  // 判断是否有特殊内容（Skill 卡片或问题列表）
  const hasSpecialContent = (actionCards && actionCards.length > 0) || (assistantQuestions && assistantQuestions.length > 0) || (toolCalls && toolCalls.length > 0);
  const hasTextContent = displayContent && displayContent.trim() !== '' && !isPlaceholderMessage;

  // Comfort messages for loading state
  const comfortMessages = [
    '正在认真思考你说的话...',
    '每一种情绪都值得被看见',
    '慢慢来，我在这里陪着你',
  ];
  const [comfortIndex, setComfortIndex] = useState(0);

  // Rotate comfort messages when loading
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setComfortIndex(prev => (prev + 1) % comfortMessages.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isLoading, comfortMessages.length]);

  // 保护：如果 assistant 消息内容为空，且没有特殊内容
  if (!isUser && !hasTextContent && !hasSpecialContent) {
    // 如果正在加载中、正在发送中、或是占位符消息，显示 Loading 动画 + 安抚文案
    if (isLoading || isSending || isPlaceholderMessage) {
      return (
        <div className="flex flex-col gap-2 mb-6 items-start animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="rounded-xl px-5 py-4 shadow-glow bg-white border border-indigo-50/50 msg-bubble-ai">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                {/* 三层情绪光球动画 */}
                <div className="thinking-orb">
                  <div className="thinking-orb-ring" />
                  <div className="thinking-orb-middle" />
                  <div className="thinking-orb-core" />
                </div>
                <span className="text-sm font-medium thinking-text-gradient">
                  正在深入思考...
                </span>
              </div>
              <div className="h-4 overflow-hidden relative">
                <span className="text-xs thinking-comfort-text italic whitespace-nowrap transition-all duration-700 block translate-y-0">
                  {comfortMessages[comfortIndex]}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // DEBUG: 暂时允许渲染空消息，以便调试为何内容丢失
    // return null;
    return (
      <div className="flex flex-col gap-2 mb-4 items-start opacity-50">
        <div className="rounded-xl px-4 py-3 shadow-sm bg-gray-50 border border-dashed border-gray-300">
          <span className="text-xs text-gray-400">[Debug: Empty Assistant Message]</span>
        </div>
      </div>
    );
  }

  const isConclusion = !isUser && assessmentStage === 'conclusion';
  const isIntake = !isUser && assessmentStage === 'intake';
  const isGapFollowup = !isUser && assessmentStage === 'gap_followup';

  // 判断是否是 skill 消息（包含行动卡片）
  const isSkillMessage = !isUser && actionCards && actionCards.length > 0;

  // 判断是否处于 followup 状态（用于显示快捷回复）
  const isInFollowup = isGapFollowup || currentState === 'awaiting_followup';
  const quickReplyResult = !isUser && isInFollowup && onSendMessage
    ? detectQuickReplyMode(message.content)
    : { mode: 'none' as const, options: undefined, scaleContext: undefined };
  const quickReplyMode = quickReplyResult.mode;
  const quickReplyOptions = quickReplyResult.options || [];
  const quickReplyScaleContext = quickReplyResult.scaleContext;

  // 修复A: 确保快捷回复能正确发送
  const handleQuickReply = (text: string) => {
    if (onSendMessage && text) {
      // 点击后自动发送，传入文本参数
      onSendMessage(text);
    }
  };

  // 决定是否显示 CoT 按钮：只要有任何分析数据就显示
  // 修改：检查 safety 对象存在（而非 reasoning），确保始终显示 COT
  const hasThinkingContent = !isUser && !isPlaceholderMessage && message.metadata && (
    message.metadata.safety || // 只要有安全评估就显示
    message.metadata.routeType || // 有接待专家就显示
    (message.emotion && message.emotion.label !== '未表达') || // 有明确情绪就显示
    message.metadata.memory?.check !== '无' || // 有记忆操作就显示
    message.metadata.memory?.retrieved
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-2 mb-4',
        isUser ? 'items-end' : 'items-start',
        // skill 消息需要全宽容器
        isSkillMessage && 'w-full'
      )}
    >
      <div
        className={cn(
          'rounded-xl px-4 py-3 shadow-sm',
          isUser
            ? 'bg-blue-600 text-white max-w-[80%] sm:max-w-[80%]'
            : isSkillMessage
              ? 'bg-white text-gray-900 shadow-sm w-full max-w-6xl mx-auto'
              : 'bg-white text-gray-900 shadow-glow max-w-[85%] sm:max-w-[80%] msg-bubble-ai'
        )}
      >
        {/* Logic Chain Visualization (CoT) */}
        {hasThinkingContent && (
          <div className="mb-3 border-b border-indigo-50 pb-2">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50/30 px-2 py-0.5 rounded-full border-none cursor-pointer"
            >
              <div className={cn("w-1 h-1 rounded-full bg-indigo-400 animate-pulse", showReasoning && "bg-indigo-600 animate-none")} />
              {showReasoning ? '收起思考过程' : '查看思考过程'}
            </button>
            {showReasoning && (
              <div className="mt-2 text-[11px] leading-relaxed text-gray-600 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100/50 animate-in fade-in slide-in-from-top-1 duration-300 space-y-2 cot-detail-mood">
                {/* 1. 安全评估 - 安全时不使用负面语言 */}
                {message.metadata?.safety && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">🛡️</span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">安全评估：</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-1",
                        message.metadata.safety.label === 'crisis' ? "bg-red-100 text-red-600" :
                          message.metadata.safety.label === 'urgent' ? "bg-orange-100 text-orange-600" :
                            message.metadata.safety.label === 'self-care' ? "bg-yellow-100 text-yellow-600" :
                              "bg-green-100 text-green-600"
                      )}>
                        {message.metadata.safety.label === 'normal' ? '安全' :
                          message.metadata.safety.label === 'self-care' ? '需自我关照' :
                            message.metadata.safety.label === 'urgent' ? '需关注' : '危机'}
                      </span>
                      {/* 只在非安全时显示详细原因，安全时用简短描述 */}
                      {message.metadata.safety.label !== 'normal' && message.metadata.safety.reasoning && (
                        <span className="text-gray-500 ml-1">— {message.metadata.safety.reasoning}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. 情绪感知 - 仅在明确识别情绪时显示 */}
                {message.emotion && message.emotion.label !== '未表达' && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">🎨</span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">情绪感知：</span>
                      <span className="text-gray-800 font-medium">{message.emotion.label}</span>
                      <span className="text-gray-400 text-[10px] bg-gray-100 px-1 py-0.5 rounded ml-1">强度 {message.emotion.score}</span>
                    </div>
                  </div>
                )}

                {/* 3. 接待专家 (合并角色策略和专家路由) */}
                {message.metadata?.routeType && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">👤</span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">接待专家：</span>
                      <span className="text-indigo-600 font-medium">
                        {message.metadata.routeType === 'crisis' ? '🚨 危机支持' :
                          message.metadata.routeType === 'assessment' ? '📋 深度了解' : '❤️ 情感陪伴'}
                      </span>
                      {/* 如果有 persona reasoning，显示策略说明 */}
                      {message.metadata?.persona?.reasoning && (
                        <span className="text-gray-500 ml-1">— {message.metadata.persona.reasoning}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. 记忆上下文 - 仅在有实际记忆操作时显示（渐进式披露） */}
                {message.metadata?.memory && (
                  message.metadata.memory.check !== '无' || message.metadata.memory.retrieved
                ) && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 shrink-0">🧠</span>
                      <div className="flex-1">
                        <span className="font-medium text-gray-700">记忆上下文：</span>
                        {message.metadata?.memory?.check && message.metadata.memory.check !== '无' && (
                          <span className="text-blue-600">[存储] {message.metadata.memory.check}</span>
                        )}
                        {message.metadata?.memory?.retrieved && (
                          <span className="text-green-600 ml-1">[提取] {message.metadata.memory.retrieved}</span>
                        )}
                      </div>
                    </div>
                  )}

                {/* 5. 安全约束 - 仅在有深度安全评估约束时显示 */}
                {message.metadata?.safety?.constraints && message.metadata.safety.constraints.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">🔒</span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">安全约束：</span>
                      <div className="mt-1 space-y-1">
                        {message.metadata.safety.constraints.map((c: string, i: number) => (
                          <div key={i} className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded inline-block mr-1">
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-sm sm:text-base">{message.content}</p>
        ) : (
          <>
            {/* Generative UI Tool Calling Logic */}
            {toolCalls && toolCalls.length > 0 ? (
              <div className="space-y-4">
                {displayContent && <ReactMarkdown className="prose prose-sm max-w-none" remarkPlugins={[remarkBreaks]}>{displayContent}</ReactMarkdown>}
                {toolCalls.map((tc: any) => {
                  try {
                    if (!tc?.function?.arguments) return null;

                    let args;
                    if (typeof tc.function.arguments === 'string') {
                      args = JSON.parse(tc.function.arguments);
                    } else {
                      args = tc.function.arguments;
                    }

                    if (tc.function.name === 'show_quick_replies') {
                      return (
                        <div key={tc.id} className="mt-2">
                          <p className="text-xs text-gray-500 mb-2 italic">请点击下方选项进行回复：</p>
                          <QuickReplies
                            mode={args.mode}
                            options={args.options}
                            onPick={handleQuickReply}
                            disabled={isSending}
                          />
                        </div>
                      );
                    }
                    if (tc.function.name === 'render_assessment_report') {
                      return (
                        <ConclusionSections
                          key={tc.id}
                          reply={args.summary} // Use summary as main text
                          actionCards={args.actionCards}
                          routeType="assessment"
                          messageId={message.id}
                          sessionId={sessionId}
                        />
                      );
                    }
                    if (tc.function.name === 'recommend_lab_exploration') {
                      const labEmoji: Record<string, string> = { wisdom: '🏛️', mirrors: '🪞', group: '🎯' };
                      const labLabel: Record<string, string> = { wisdom: '智慧殿堂', mirrors: '镜像回廊', group: '圆桌论道' };
                      return (
                        <button
                          key={tc.id}
                          onClick={() => router.push('/dashboard/lab')}
                          className="mt-3 w-full text-left rounded-xl p-4 border border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-lg">{labEmoji[args.labType] || '🔬'}</span>
                            <span className="text-sm font-semibold text-purple-800">{args.title}</span>
                          </div>
                          <p className="text-xs text-purple-600/80 leading-relaxed">{args.description}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-purple-400">{labLabel[args.labType] || '实验室'}</span>
                            <span className="text-xs text-purple-500 group-hover:translate-x-0.5 transition-transform">去看看 →</span>
                          </div>
                        </button>
                      );
                    }
                  } catch (e) {
                    console.error('Failed to parse tool call arguments', tc, e);
                  }
                  return null;
                })}
              </div>
            ) : isConclusion && routeType === 'assessment' ? (
              <ConclusionSections
                reply={displayContent}
                actionCards={actionCards}
                routeType={routeType}
                messageId={message.id}
                sessionId={sessionId}
                validationError={validationError}
              />
            ) : isConclusion && routeType === 'crisis' ? (
              // Crisis 路由的 conclusion 阶段：只显示风险与分流，不显示行动卡片
              <ConclusionSections
                reply={displayContent}
                actionCards={undefined}
                routeType={routeType}
                messageId={message.id}
                sessionId={sessionId}
                validationError={validationError}
              />
            ) : (
              <div className="prose prose-sm max-w-none">
                {/* intake 阶段：轻量样式，使用 blockquote */}
                {isIntake && assistantQuestions && assistantQuestions.length > 0 ? (
                  <>
                    {/* intake 阶段：普通气泡样式，不突出 - 移除numbered list，保持一致性 */}
                    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                      {displayContent && <p className="mb-2">{displayContent}</p>}
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{assistantQuestions.join('\n\n')}</ReactMarkdown>
                    </div>
                    {/* intake 阶段已渲染问题，不再渲染 message.content（已去重） */}
                  </>
                ) : isGapFollowup ? (
                  <>
                    {/* gap_followup 阶段：轻量样式，使用 blockquote */}
                    {assistantQuestions && assistantQuestions.length > 0 ? (
                      <>
                        {/* gap_followup 阶段：普通气泡样式，不突出 */}
                        <div className="border-l-2 border-gray-200 pl-3 py-2 my-2">
                          <p className="text-sm text-gray-700 mb-2">
                            {(() => {
                              // 从 message.content 提取引导语，如果没有则使用默认
                              const cleanedContent = stripDuplicateFollowupText(
                                displayContent,
                                assistantQuestions[0]
                              );
                              // 如果去重后还有内容，使用去重后的内容作为引导语
                              if (cleanedContent && cleanedContent.trim().length > 0) {
                                return cleanedContent;
                              }
                              // 否则使用 message.content 作为引导语（如果存在）
                              return displayContent || '我想更准确地帮你，补充一个小问题：';
                            })()}
                          </p>
                          <div className="prose prose-sm max-w-none text-gray-700 space-y-2 leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkBreaks]}>{assistantQuestions[0]}</ReactMarkdown>
                          </div>
                          {/* 修复：在 gap_followup 阶段，如果问题明确要求用0-10评分，显示可点击选项 */}
                          {/* 更严格的检测：需要明确的评分请求模式，避免误触发 */}
                          {assistantQuestions[0] && /用\s*0\s*[-到至]\s*10\s*(分|打分|评分)|请.*打分|给.*评分|0\s*[-到至]\s*10\s*分.*评/.test(assistantQuestions[0]) && (
                            <>
                              <p className="text-xs text-gray-600 mt-2 italic">
                                提示：点击数字即可发送
                              </p>
                              <QuickReplies
                                mode="scale0to10"
                                onPick={handleQuickReply}
                                options={[]}
                                scaleContext={detectQuickReplyMode(assistantQuestions[0]).scaleContext}
                                disabled={isSending}
                              />
                            </>
                          )}
                        </div>
                        {/* gap_followup 阶段已渲染问题，不再渲染 message.content（已去重） */}
                      </>
                    ) : (
                      // 如果没有 assistantQuestions，降级为普通 markdown 渲染
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{displayContent}</ReactMarkdown>
                    )}
                  </>
                ) : (
                  <>
                    {/* 其他阶段：正常渲染 message.content */}
                    <div className="text-gray-900">
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{displayContent || ''}</ReactMarkdown>
                    </div>
                    {/* Debug: 如果没内容，显示提示 */}
                    {(!displayContent && !isLoading) && (
                      <div className="text-red-500 text-xs mt-1">Debug: Content is empty</div>
                    )}

                    {/* 修复：在 gap_followup 阶段，如果 assistant 文本明确要求用0-10评分，显示可点击选项 */}
                    {/* 更严格的检测：需要明确的评分请求模式，避免误触发 */}
                    {(isGapFollowup || (routeType === 'assessment' && assessmentStage === 'gap_followup')) &&
                      (quickReplyMode === 'scale0to10' || /用\s*0\s*[-到至]\s*10\s*(分|打分|评分)|请.*打分|给.*评分|0\s*[-到至]\s*10\s*分.*评/.test(displayContent)) && (
                        <>
                          <p className="text-xs text-gray-600 mt-2 italic">
                            提示：点击数字即可发送
                          </p>
                          <QuickReplies
                            mode="scale0to10"
                            onPick={handleQuickReply}
                            options={[]}
                            scaleContext={quickReplyScaleContext}
                            disabled={isSending}
                          />
                        </>
                      )}
                    {quickReplyMode !== 'none' && quickReplyMode !== 'scale0to10' && (
                      <>
                        <QuickReplies
                          mode={quickReplyMode}
                          onPick={handleQuickReply}
                          options={quickReplyOptions || []}
                          disabled={isSending}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* RAG 资源卡片 */}
            {message.resources && message.resources.length > 0 && (
              <div className="mt-4 w-full border-t border-gray-100 pt-3">
                <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                  <span>📚</span> 推荐资源
                </h4>
                <div className="space-y-2">
                  {message.resources.map(resource => (
                    <ResourceCard key={resource.id} resource={resource} />
                  ))}
                </div>
              </div>
            )}

            {/* 修复：全宽渲染 Action Cards (如：推荐呼吸法)，移出条件判断以防被覆盖 */}
            {actionCards && actionCards.length > 0 && (
              <div className="mt-4 w-full">
                <ActionCardGrid
                  cards={actionCards}
                  messageId={message.id}
                  sessionId={sessionId}
                />
              </div>
            )}
          </>
        )}
      </div>

      <span className={cn(
        'text-xs px-2 font-medium',
        isUser ? 'text-gray-400' : 'text-gray-400'
      )}>
        {formatTime(message.timestamp)}
      </span>

      {/* Feedback Buttons (Only for Assistant & Not Placeholder) */}
      {!isUser && !isPlaceholderMessage && !isSending && (
        <FeedbackButtons messageId={message.id} />
      )}
    </div>
  );
}

function FeedbackButtons({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRate = async (newRating: number) => {
    if (isSubmitting || rating === newRating) return;

    // Optimistic UI update
    setRating(newRating);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, rating: newRating })
      });

      if (!res.ok) throw new Error('Failed to submit feedback');
    } catch (e) {
      console.error('Feedback failed:', e);
      Toast.error('反馈提交失败，请稍后重试');
      setRating(null); // Revert on error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-2 opacity-40 hover:opacity-100 transition-opacity duration-300">
      <button
        onClick={() => handleRate(1)}
        className={cn(
          "flex items-center gap-1 text-xs hover:text-indigo-600 transition-colors bg-transparent border-none cursor-pointer outline-none",
          rating === 1 ? "text-indigo-600" : "text-gray-500"
        )}
        title="有帮助"
      >
        {rating === 1 ? <IconThumbUpFill /> : <IconThumbUp />}
      </button>
      <button
        onClick={() => handleRate(-1)}
        className={cn(
          "flex items-center gap-1 text-xs hover:text-gray-900 transition-colors bg-transparent border-none cursor-pointer outline-none",
          rating === -1 ? "text-gray-900" : "text-gray-500"
        )}
        title="没感觉/不相关"
      >
        {rating === -1 ? <IconThumbDownFill /> : <IconThumbDown />}
      </button>
    </div>
  );
}




