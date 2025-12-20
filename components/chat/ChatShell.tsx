'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useChatStore } from '@/store/chatStore';
import { sendChatMessage } from '@/lib/api/chat';
import { Message } from '@/types/chat';
import { useRouter } from 'next/navigation';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { DebugDrawer } from './DebugDrawer';
import { Button, Modal, Tag, Message as ArcoMessage } from '@arco-design/web-react';
import { IconStop, IconInfoCircle } from '@arco-design/web-react/icon';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface ChatShellProps {
  sessionId?: string;  // Optional - undefined for new chat
  initialMessages: Message[];
  isReadOnly?: boolean;
}

export function ChatShell({ sessionId, initialMessages, isReadOnly = false }: ChatShellProps) {
  const {
    messages,
    currentState,
    routeType,
    assessmentStage,
    initialMessage,
    followupAnswerDraft,
    isLoading,
    error,
    debugPrompts,
    validationError,
    addMessage,
    updateMessage, // New interface
    setLoading,
    setError, // ...
    updateState,
    clearMessages,
    appendFollowupAnswer,
    clearFollowupAnswer,
    setDebugPrompts,
    setValidationError,
    setLastRequestPayload,
    lastRequestPayload,
    resetConversation,
    setMessages, // Need to expose setMessages in store or use clear+add
  } = useChatStore();

  const router = useRouter();
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  // Internal session ID state - allows lazy creation
  const [internalSessionId, setInternalSessionId] = useState<string | undefined>(sessionId);

  // Sync with prop changes (for when navigating to existing session)
  useEffect(() => {
    setInternalSessionId(sessionId);
  }, [sessionId]);

  // Hydrate Store on Mount / Session Change
  useEffect(() => {
    if (initialMessages) {
      // Force replace messages with server data
      setMessages(initialMessages);
    }
  }, [internalSessionId, initialMessages, setMessages]);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollContainerRef = useRef<HTMLElement>(null);
  // 修复C: 发送队列
  const sendQueueRef = useRef<string[]>([]);
  // 修复D: 防止并发创建会话
  const isCreatingSessionRef = useRef(false);

  // 组件挂载时，强制重置isLoading和isSending为false（防止状态卡住）
  useEffect(() => {
    // 立即重置所有可能卡住的状态
    setLoading(false);
    setIsSending(false);
    setError(null);

    // 添加全局错误处理，捕获浏览器扩展的错误
    const handleError = (event: ErrorEvent) => {
      // 如果是浏览器扩展的错误（content_script），静默处理
      if (event.filename && (
        event.filename.includes('content_script') ||
        event.filename.includes('extension')
      )) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // 如果是浏览器扩展的错误，静默处理
      const errorStr = String(event.reason || '');
      if (errorStr.includes('control') || errorStr.includes('content_script')) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    return () => {
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
    };
  }, []); // 只在挂载时执行一次

  // 监听isLoading和isSending，如果异常卡住则自动恢复
  useEffect(() => {
    // 如果isLoading为true但isSending为false超过3秒，说明可能卡住了
    if (isLoading && !isSending) {
      const timer = setTimeout(() => {
        console.warn('检测到isLoading异常卡住，正在自动恢复...');
        setLoading(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isSending, setLoading]);

  const handleEndSession = useCallback(() => {
    if (window.confirm('确定要结束当前咨询吗？结束将返回列表页。')) {
      // 1. Clear local store
      resetConversation();
      setDraft('');
      setIsSending(false);
      setLoading(false);
      setError(null);

      // 2. Redirect to dashboard list
      router.push('/dashboard');
    }
  }, [resetConversation, setLoading, setError, router]);

  // 构建 messageExtras Map，用于传递额外的 props 给 MessageBubble
  const messageExtras = useMemo(() => {
    const extras = new Map<string, {
      routeType?: 'crisis' | 'assessment' | 'support';
      assessmentStage?: 'intake' | 'gap_followup' | 'conclusion';
      actionCards?: any[];
      assistantQuestions?: string[];
      validationError?: {
        actionCards?: string;
        nextStepsLines?: string;
      };
      toolCalls?: any[];
    }>();
    messages.forEach((msg: Message) => {
      if (msg.role === 'assistant') {
        // 找到对应的消息的额外信息（这里简化处理，实际应该从消息中提取）
        // 为了简化，我们可以在消息中添加 metadata
        const msgData = (msg as any).metadata;
        if (msgData) {
          extras.set(msg.id, {
            routeType: msgData.routeType,
            assessmentStage: msgData.assessmentStage,
            actionCards: msgData.actionCards,
            assistantQuestions: msgData.assistantQuestions,
            validationError: msgData.validationError,
            toolCalls: msgData.toolCalls || (msg as any).toolCalls,
          });
        }
      }
    });
    return extras;
  }, [messages]);

  // 收集所有 assistant 消息的情绪信息（用于 Debug 面板）
  const emotions = useMemo(() => {
    return messages
      .filter((msg: Message) => msg.role === 'assistant' && msg.emotion)
      .map((msg: Message) => ({
        messageId: msg.id,
        emotion: msg.emotion!,
      }));
  }, [messages]);

  const handleSend = useCallback(
    async (text?: string) => {
      // 修复A: 支持从快捷回复传入文本
      const content = (text !== undefined ? text : draft).trim();

      console.log('[ChatShell] handleSend called', {
        textArg: text,
        draftValue: draft,
        finalContent: content,
        sessionId: internalSessionId,
        isSendingState: isSending
      });

      // 严格检查：禁止发送空字符串
      if (!content || content.length === 0) {
        return; // 没有内容，直接返回
      }

      // Lazy session creation: 如果没有 sessionId，先创建会话
      let currentSessionId = internalSessionId;
      if (!currentSessionId) {
        // 防止并发创建会话
        if (isCreatingSessionRef.current) {
          console.log('[ChatShell] Session creation already in progress, queueing message');
          sendQueueRef.current.push(content);
          return;
        }
        isCreatingSessionRef.current = true;
        try {
          const { createNewSessionAndReturnId } = await import('@/lib/actions/chat');
          currentSessionId = await createNewSessionAndReturnId();
          setInternalSessionId(currentSessionId);
          // Update URL without full page reload
          window.history.replaceState(null, '', `/dashboard/${currentSessionId}`);
          console.log('[ChatShell] Created new session:', currentSessionId);
        } catch (err) {
          console.error('[ChatShell] Failed to create session:', err);
          setError('创建会话失败，请刷新页面重试');
          isCreatingSessionRef.current = false;
          return;
        } finally {
          isCreatingSessionRef.current = false;
        }
      }

      const isFirstMessage = messages.length === 0;

      // 修复C: 如果正在发送，将消息加入队列而不是直接返回
      if (isLoading || isSending) {
        // 如果传入的是快捷回复文本，直接加入队列
        if (text !== undefined) {
          sendQueueRef.current.push(text);
          return;
        }
        // 如果是普通输入，也加入队列
        sendQueueRef.current.push(draft.trim());
        setDraft(''); // 清空输入框，允许继续输入
        return;
      }

      // 保存原始内容用于失败恢复
      const originalContent = content;

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      // 乐观更新：立即添加用户消息到消息流
      addMessage(userMessage);
      // 立即清空输入框 (修复 input 不清空的问题)
      if (text === undefined || text === draft) {
        setDraft('');
      }
      // 设置发送中状态
      setIsSending(true);
      setLoading(true);
      setError(null);

      // 处理 followupAnswer 累计逻辑
      let messageToSend: string;
      let currentInitialMessage: string | undefined;

      if (currentState === 'awaiting_followup') {
        // 在 awaiting_followup 阶段：累计用户输入
        // 先计算累计值（基于当前的 followupAnswerDraft）
        const updatedDraft = followupAnswerDraft
          ? `${followupAnswerDraft}\n${content.trim()}`
          : content.trim();
        // 更新 store（用于下次累计）
        // 注意：这里需要同步更新，但由于 zustand 的 set 是同步的，我们可以直接使用计算后的值
        appendFollowupAnswer(content.trim());
        // 使用累计后的值发送请求
        messageToSend = updatedDraft;
        currentInitialMessage = initialMessage;
      } else {
        // 非 awaiting_followup 阶段：清空累计，设置新的 initialMessage
        clearFollowupAnswer();
        currentInitialMessage = isFirstMessage ? content.trim() : initialMessage;
        messageToSend = content.trim();
      }

      try {
        // 构建请求 payload（用于 DebugDrawer 展示）
        const requestPayload: any = {
          message: messageToSend,
          history: messages.map((msg: Message) => ({
            role: msg.role,
            content: msg.content,
          })),
          state: currentState,
          assessmentStage,
          meta: {
            ...(currentInitialMessage && { initialMessage: currentInitialMessage }),

          },
        };

        // 保存到 store（用于 DebugDrawer 展示）
        setLastRequestPayload(requestPayload);

        // Create assistant message placeholder upfront
        const assistantMsgId = generateId();
        const placeholderMessage: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: '', // Start empty
          timestamp: new Date().toISOString(),
        };
        addMessage(placeholderMessage);

        let localAccumulatedContent = '';

        const { response: finalResponse, error: finalApiError } = await sendChatMessage(
          messageToSend,
          requestPayload.history,
          currentState,
          assessmentStage,
          currentInitialMessage,
          requestPayload.meta,
          (chunk) => {
            localAccumulatedContent += chunk;
            updateMessage(assistantMsgId, { content: localAccumulatedContent });
          },
          currentSessionId
        );

        if (finalApiError) {
          // 请求失败：恢复输入内容并插入系统提示
          // AND remove or update the placeholder message to be error?
          // Let's update the placeholder to be the error message.

          setDraft(originalContent);

          updateMessage(assistantMsgId, {
            content: `发送失败：${finalApiError.error}。你的消息已恢复到输入框，可以点击重试。`,
            // Add metadata
            // ... cast to any for metadata
          });

          // ... existing error handling logic ...
          // But wait, existing logic ADDS a new error message.
          // I should probably remove the placeholder or reuse it.
          // Let's reuse it.

          // We need to attach metadata.
          // Since `updateMessage` takes Partial<Message>, and metadata is not on Message type (it's hidden/any),
          // we might need to cast or access it.

          // Actually `Message` interface doesn't have metadata. `messageExtras` map handles it in UI.
          // But `messageExtras` is built from `messages`.
          // Wait, `ChatShell` derives `messageExtras` from `messages` loop: `const msgData = (msg as any).metadata;`
          // So `Message` objects in store CAN have metadata property (as any).

          updateMessage(assistantMsgId, {
            content: `发送失败：${finalApiError.error}。你的消息已恢复到输入框，可以点击重试。`,
            metadata: {
              error: true,
              errorCode: (finalApiError as any).details || 'UNKNOWN_ERROR',
              originalError: finalApiError.error,
              isSystemError: true,
            }
          } as any);

          // ... set store errors ...
          setError(finalApiError.error);
          setValidationError({
            emptyReply: `请求错误: ${finalApiError.error}`,
            errorCode: (finalApiError as any).details || 'UNKNOWN_ERROR',
          });
          return;
        }

        const responseData = finalResponse; // successful response

        // 再次检查 reply 是否为空（防御性编程）
        // 同时检查：如果 reply 为空且没有结构化内容（actionCards、assistantQuestions），则不添加消息
        const isEmptyReply = !responseData.reply || responseData.reply.trim() === '';
        const hasStructuredContent = (responseData.actionCards && responseData.actionCards.length > 0) ||
          (responseData.assistantQuestions && responseData.assistantQuestions.length > 0);

        if (isEmptyReply && !hasStructuredContent) {
          // 空回复且无结构化内容
          setDraft(originalContent);

          updateMessage(assistantMsgId, {
            content: '发送失败：服务器返回了空回复。你的消息已恢复到输入框，可以点击重试。',
            metadata: {
              error: true,
              errorCode: 'EMPTY_REPLY_NO_STRUCTURE',
              isSystemError: true,
            }
          } as any);

          console.warn('[ChatShell] 检测到空 assistant 消息（无结构化内容），已拦截');
          setError('服务器返回了空回复');
          setValidationError({
            emptyReply: '解析后 reply 为空且无结构化内容',
            errorCode: 'EMPTY_REPLY_NO_STRUCTURE',
          });
          return;
        }

        // 如果 reply 为空但有结构化内容，使用默认文本
        if (isEmptyReply && hasStructuredContent) {
          responseData.reply = '我想了解一些信息：';
          // Update placeholder with this text
          updateMessage(assistantMsgId, { content: responseData.reply });
        }

        // Final update for the assistant message (attach emotion, actionCards, etc.)
        updateMessage(assistantMsgId, {
          content: responseData.reply, // Ensure content is final
          timestamp: responseData.timestamp,
          emotion: responseData.emotion,
          metadata: {
            routeType: responseData.routeType,
            assessmentStage: responseData.assessmentStage,
            actionCards: responseData.actionCards,
            assistantQuestions: responseData.assistantQuestions,
            validationError: responseData.validationError,
            toolCalls: responseData.toolCalls,
          }
        } as any);


        // 更新状态（包括 followupSlot，如果存在）
        updateState({
          currentState: responseData.state,
          routeType: responseData.routeType,
          assessmentStage: responseData.assessmentStage,
          initialMessage: currentInitialMessage,
        });

        // 保存 followupSlot 状态（如果存在），用于下次请求传递



        // 修复：保存 pressureSocratic 状态（如果存在），用于下次请求传递



        // 如果状态切回 normal 或进入 conclusion，清空 followupAnswerDraft
        if (responseData.state === 'normal' || responseData.assessmentStage === 'conclusion') {
          clearFollowupAnswer();
        }
        // 如果从 normal 切换到 awaiting_followup，确保 followupAnswerDraft 为空（首次进入）
        else if (responseData.state === 'awaiting_followup' && currentState !== 'awaiting_followup') {
          clearFollowupAnswer();
        }

        // 设置 debug 信息
        if (responseData.debugPrompts) {
          setDebugPrompts(responseData.debugPrompts);
        }
        if (responseData.validationError) {
          setValidationError(responseData.validationError);
        }

        // 如果是第一条消息，刷新路由以更新 Sidebar 标题
        if (isFirstMessage) {
          router.refresh();
        }

        // 成功后输入框已清空（乐观更新时已清空），这里不需要再次清空
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '发送消息失败';
        setError(errorMessage);
        console.error('Send message error:', err);

        // 请求失败：恢复输入内容（仅当不是从快捷回复传入时）
        if (text === undefined) {
          setDraft(originalContent);
        }

        // 添加系统错误提示消息
        const errorSystemMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: `发送失败：${errorMessage}。你的消息已恢复到输入框，可以点击重试。`,
          timestamp: new Date().toISOString(),
        };

        (errorSystemMessage as any).metadata = {
          error: true,
          errorCode: 'NETWORK_ERROR',
          originalError: errorMessage,
          isSystemError: true,
        };

        addMessage(errorSystemMessage);
        setValidationError({
          networkError: `网络错误: ${errorMessage}`,
          errorCode: 'NETWORK_ERROR',
        });
      } finally {
        // 确保状态总是被重置，无论成功还是失败
        setIsSending(false);
        setLoading(false);

        // 修复C: 处理发送队列（使用setTimeout避免在回调中直接递归）
        if (sendQueueRef.current.length > 0) {
          const nextMessage = sendQueueRef.current.shift();
          if (nextMessage) {
            // 使用setTimeout确保状态已更新，避免在回调中直接递归
            setTimeout(() => {
              // 直接调用handleSend，此时isLoading和isSending已经是false
              handleSend(nextMessage);
            }, 100);
          }
        }
      }
    },
    [
      draft,
      messages,
      isLoading,
      isSending,
      currentState,
      assessmentStage,
      initialMessage,
      followupAnswerDraft,
      addMessage,
      setLoading,
      setError,
      updateState,
      appendFollowupAnswer,
      clearFollowupAnswer,
      setDebugPrompts,
      setValidationError,
      setLastRequestPayload,
      setDraft,
      sendQueueRef,
    ]
  );

  // 45分钟倒计时逻辑 (2700秒)
  const SESSION_DURATION = 2700;
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);
  const isSessionEnded = timeLeft <= 0;

  useEffect(() => {
    // 如果已经结束，不执行
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // 格式化时间 MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-slate-50">
      {/* 顶部栏 - 固定高度 */}
      <header className="w-full bg-white/80 backdrop-blur-sm border-b border-gray-100 z-20 shrink-0">
        <div className="w-full max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" title={internalSessionId ? `会话 ID: ${internalSessionId}` : undefined}>
              <span className="text-xl">{isReadOnly ? '📋' : '💬'}</span>
              <h1 className="text-lg font-semibold text-gray-800">
                {isReadOnly ? '历史会话' : '咨询中'}
              </h1>
            </div>
            {/* 仅活跃会话显示倒计时 */}
            {!isReadOnly && !isSessionEnded && (
              <Tag
                color={timeLeft < 300 ? 'red' : 'arcoblue'}
                size="small"
                className="font-mono"
              >
                ⏱️ 剩余 {formatTime(timeLeft)}
              </Tag>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isReadOnly ? (
              <Tag color="gray" size="small">咨询已结束</Tag>
            ) : (
              messages.length > 0 && (
                <Button
                  size="small"
                  icon={<IconStop />}
                  onClick={handleEndSession}
                >
                  结束咨询
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      {/* 消息列表 - flex-1 滚动容器 */}
      <section
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain w-full min-h-0 scrollbar-thin"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <MessageList
          messages={messages}
          isLoading={isLoading}
          isSending={isSending}
          messageExtras={messageExtras}
          onSendMessage={(text: string) => handleSend(text)}
          scrollContainerRef={scrollContainerRef}
        />
        {isSessionEnded && (
          <div className="p-6 mx-4 mb-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
            <div className="text-center">
              <div className="text-3xl mb-3">🌿</div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">本次咨询已结束</h3>
              <p className="text-sm text-gray-600 mb-4">感谢你的信任与分享，每一次倾诉都是勇敢的一步。</p>
              <div className="bg-white rounded-lg p-3 text-left text-sm text-gray-700 mb-4">
                <p className="font-medium mb-1">小结：</p>
                <p>本次对话共 {messages.length} 条消息，时长约 45 分钟。</p>
                <p className="mt-1 text-gray-500">你的历史记录已安全保存，可以随时回顾。</p>
              </div>
              <Button
                type="primary"
                onClick={() => router.push('/dashboard')}
              >
                开始新的咨询
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* 输入框 - shrink-0 固定在底部 */}
      <footer className="w-full bg-slate-50 z-30 shrink-0 pb-[env(safe-area-inset-bottom)] border-t border-gray-100">
        <div className="mx-auto w-full max-w-4xl px-4 py-3">
          <ChatInput
            value={draft}
            onChange={(newValue) => {
              setDraft(newValue);
            }}
            onSend={handleSend}
            isLoading={isLoading || isSending}
            disabled={isReadOnly || isSessionEnded}
            placeholder={isSessionEnded ? "本次会话已结束" : undefined}
          />
        </div>
      </footer>

      {/* 错误提示 */}
      {error && (
        <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded-lg shadow-lg text-sm z-40">
          {error}
        </div>
      )}

      {/* Debug 面板 */}
      <DebugDrawer
        debugPrompts={debugPrompts}
        validationError={validationError}
        emotions={emotions}
        lastRequestPayload={lastRequestPayload}
      />

      {/* 免责声明弹窗 */}
      <Modal
        visible={disclaimerOpen}
        onCancel={() => setDisclaimerOpen(false)}
        title="免责声明"
        footer={
          <Button type="primary" long onClick={() => setDisclaimerOpen(false)}>
            我知道了
          </Button>
        }
        style={{ maxWidth: 420 }}
      >
        <div className="text-sm text-gray-700 space-y-3">
          <p>
            本产品仅供学习和研究使用，不能替代专业心理咨询服务。
          </p>
          <p>
            如遇严重心理危机，请立即寻求专业帮助：
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-600">
            <li>全国24小时心理危机干预热线：<strong className="text-gray-800">400-161-9995</strong></li>
            <li>如遇紧急情况，请立即拨打 <strong className="text-gray-800">110</strong> 或前往就近医院急诊科</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
