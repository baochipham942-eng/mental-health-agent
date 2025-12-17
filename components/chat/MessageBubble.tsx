'use client';

import ReactMarkdown from 'react-markdown';
import { Message } from '@/types/chat';
import { formatTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { ConclusionSections } from './ConclusionSections';
import { QuickReplies, detectQuickReplyMode } from './QuickReplies';
import { useChatStore } from '@/store/chatStore';
import { ResourceCard } from './ResourceCard';

/**
 * 去除重复的 followup 问题文本
 * 当 assistantText 中包含与 followup 卡片内容高度相似的段落时，将其剔除
 * 改进：更严格的去重逻辑，避免重复渲染问题
 */
function stripDuplicateFollowupText(rawText: string, followupQuestionText?: string): string {
  if (!followupQuestionText || !rawText) {
    return rawText;
  }

  // 规范化文本：去除标点、空格、换行，转为小写
  const normalize = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[，,。；;：:！!？?\s\n\r]/g, '')
      .trim();
  };

  const normalizedQuestion = normalize(followupQuestionText);
  if (!normalizedQuestion) {
    return rawText;
  }

  // 去除常见的引导语前缀（扩展更多模式）
  let cleaned = rawText
    .replace(/^为了更好地了解你的情况[，,]?\s*请回答[：:]\s*/i, '')
    .replace(/^我想再确认一个小问题[：:]\s*/i, '')
    .replace(/^我想再确认两个小问题[：:]\s*/i, '')
    .replace(/^我想更准确地帮你[，,]?\s*补充一个小问题[：:]\s*/i, '')
    .replace(/^我想先理解清楚你的情况[，,]?\s*我们从一个具体时刻开始[。.]\s*/i, '')
    .trim();

  // 如果去重后为空，直接返回空字符串
  if (!cleaned) {
    return '';
  }

  // 按行分割，检查每一行是否与问题文本高度相似
  const lines = cleaned.split(/\n+/);
  const filteredLines: string[] = [];

  for (const line of lines) {
    const normalizedLine = normalize(line);

    // 如果这一行与问题文本高度相似（包含关系或相似度很高），则跳过
    if (normalizedLine && normalizedQuestion) {
      // 检查是否包含：问题文本是否包含在行中，或行是否包含在问题文本中
      const lineContainsQuestion = normalizedLine.includes(normalizedQuestion);
      const questionContainsLine = normalizedQuestion.includes(normalizedLine);

      // 如果行长度与问题文本长度相近（差异不超过30%），且高度相似，则跳过
      const lengthDiff = Math.abs(normalizedLine.length - normalizedQuestion.length);
      const maxLength = Math.max(normalizedLine.length, normalizedQuestion.length);
      const isSimilarLength = maxLength > 0 && lengthDiff / maxLength < 0.3;

      // 更严格的相似度检查：如果行包含问题文本的核心部分（至少50%），则跳过
      const minLength = Math.min(normalizedLine.length, normalizedQuestion.length);
      const overlapRatio = minLength > 0 ? Math.min(normalizedLine.length, normalizedQuestion.length) / maxLength : 0;

      if ((lineContainsQuestion || questionContainsLine) && (isSimilarLength || overlapRatio > 0.5)) {
        continue; // 跳过这一行
      }
    }

    filteredLines.push(line);
  }

  // 重新组合，去除多余空行
  const result = filteredLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return result;
}

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
  isSending?: boolean;  // 新增：是否正在发送
}

export function MessageBubble({
  message,
  routeType,
  assessmentStage,
  actionCards,
  assistantQuestions,
  validationError,
  onSendMessage,
  isSending = false,  // 默认值
}: MessageBubbleProps) {
  const { currentState, isLoading } = useChatStore();
  const isUser = message.role === 'user';

  // 判断是否有特殊内容（Skill 卡片或问题列表）
  const hasSpecialContent = (actionCards && actionCards.length > 0) || (assistantQuestions && assistantQuestions.length > 0);
  const hasTextContent = message.content && message.content.trim() !== '';

  // 保护：如果 assistant 消息内容为空，且没有特殊内容
  if (!isUser && !hasTextContent && !hasSpecialContent) {
    // 如果正在加载中，显示 Loading 动画
    if (isLoading) {
      return (
        <div className="flex flex-col gap-2 mb-4 items-start">
          <div className="rounded-lg px-4 py-3 shadow-sm bg-white border border-gray-200">
            <div className="flex space-x-1 items-center h-4">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
            </div>
          </div>
        </div>
      );
    }

    console.warn('[MessageBubble] 检测到空 assistant 消息，已拦截:', message.id);
    return (
      <div className="flex flex-col gap-2 mb-4 items-start">
        <div className="rounded-lg px-4 py-3 shadow-sm bg-yellow-50 border border-yellow-300 max-w-[85%] sm:max-w-[80%]">
          <p className="text-sm text-yellow-800 italic">
            [空回复已被拦截 - Debug 面板可见详细信息]
          </p>
        </div>
        <span className="text-xs px-2 font-medium text-gray-600">
          {formatTime(message.timestamp)}
        </span>
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
    : { mode: 'none' as const, options: undefined };
  const quickReplyMode = quickReplyResult.mode;
  const quickReplyOptions = quickReplyResult.options || [];

  // 修复A: 确保快捷回复能正确发送
  const handleQuickReply = (text: string) => {
    if (onSendMessage && text) {
      // 点击后自动发送，传入文本参数
      onSendMessage(text);
    }
  };

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
          'rounded-lg px-4 py-3 shadow-sm',
          isUser
            ? 'bg-blue-600 text-white max-w-[80%] sm:max-w-[80%]'
            : isSkillMessage
              ? 'bg-white text-gray-900 border border-gray-200 w-full max-w-6xl mx-auto'
              : 'bg-white text-gray-900 border border-gray-200 max-w-[85%] sm:max-w-[80%]'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-sm sm:text-base">{message.content}</p>
        ) : (
          <>
            {isConclusion && routeType === 'assessment' ? (
              <ConclusionSections
                reply={message.content}
                actionCards={actionCards}
                routeType={routeType}
                messageId={message.id}
                validationError={validationError}
              />
            ) : isConclusion && routeType === 'crisis' ? (
              // Crisis 路由的 conclusion 阶段：只显示风险与分流，不显示行动卡片
              <ConclusionSections
                reply={message.content}
                actionCards={undefined}
                routeType={routeType}
                messageId={message.id}
                validationError={validationError}
              />
            ) : (
              <div className="prose prose-sm max-w-none">
                {/* intake 阶段：轻量样式，使用 blockquote */}
                {isIntake && assistantQuestions && assistantQuestions.length > 0 ? (
                  <>
                    {/* intake 阶段：普通气泡样式，不突出 - 移除numbered list，保持一致性 */}
                    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                      {message.content && <p className="mb-2">{message.content}</p>}
                      <ReactMarkdown>{assistantQuestions.join('\n\n')}</ReactMarkdown>
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
                                message.content,
                                assistantQuestions[0]
                              );
                              // 如果去重后还有内容，使用去重后的内容作为引导语
                              if (cleanedContent && cleanedContent.trim().length > 0) {
                                return cleanedContent;
                              }
                              // 否则使用 message.content 作为引导语（如果存在）
                              return message.content || '我想更准确地帮你，补充一个小问题：';
                            })()}
                          </p>
                          <div className="prose prose-sm max-w-none text-gray-700 space-y-2 leading-relaxed">
                            <ReactMarkdown>{assistantQuestions[0]}</ReactMarkdown>
                          </div>
                          {/* 修复：在 gap_followup 阶段，如果问题包含 0-10 量表，显示可点击选项 */}
                          {assistantQuestions[0] && /0-10|0\s*到\s*10|0\s*至\s*10|打分|评分/.test(assistantQuestions[0]) && (
                            <>
                              <p className="text-xs text-gray-600 mt-2 italic">
                                提示：点击数字即可发送
                              </p>
                              <QuickReplies
                                mode="scale0to10"
                                onPick={handleQuickReply}
                                options={[]}
                                disabled={isSending}
                              />
                            </>
                          )}
                        </div>
                        {/* gap_followup 阶段已渲染问题，不再渲染 message.content（已去重） */}
                      </>
                    ) : (
                      // 如果没有 assistantQuestions，降级为普通 markdown 渲染
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    )}
                  </>
                ) : (
                  <>
                    {/* 其他阶段：正常渲染 message.content */}
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                    {/* 修复：在 gap_followup 阶段，如果 assistant 文本包含 0-10 量表，显示可点击选项 */}
                    {(isGapFollowup || (routeType === 'assessment' && assessmentStage === 'gap_followup')) &&
                      (quickReplyMode === 'scale0to10' || /0-10|0\s*到\s*10|0\s*至\s*10|打分|评分/.test(message.content)) && (
                        <>
                          <p className="text-xs text-gray-600 mt-2 italic">
                            提示：点击数字即可发送
                          </p>
                          <QuickReplies
                            mode="scale0to10"
                            onPick={handleQuickReply}
                            options={[]}
                            disabled={isSending}
                          />
                        </>
                      )}
                    {/* 其他快捷回复模式 */}
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
          </>
        )}
      </div>

      <span className={cn(
        'text-xs px-2 font-medium',
        isUser ? 'text-gray-500' : 'text-gray-600'
      )}>
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}




