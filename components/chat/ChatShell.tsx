'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useChatStore } from '@/store/chatStore';
import { sendChatMessage } from '@/lib/api/chat';
import { Message } from '@/types/chat';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { DebugDrawer } from './DebugDrawer';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ChatShell() {
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
    setError,
    updateState,
    clearMessages,
    appendFollowupAnswer,
    clearFollowupAnswer,
    setDebugPrompts,
    setValidationError,
    setLastRequestPayload,
    lastRequestPayload,
    resetConversation,
  } = useChatStore();

  // 保存 followupSlot 状态（用于下次请求传递）
  const [followupSlotState, setFollowupSlotState] = React.useState<any>(undefined);

  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollContainerRef = useRef<HTMLElement>(null);
  // 修复C: 发送队列
  const sendQueueRef = useRef<string[]>([]);

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

  const handleClearConversation = useCallback(() => {
    if (window.confirm('确定要开始新会话吗？当前对话记录将被清空。')) {
      resetConversation();
      // 清空本地 draft
      setDraft('');
      // 重置所有可能卡住的状态
      setIsSending(false);
      setLoading(false);
      setError(null);
    }
  }, [resetConversation, setLoading, setError]);

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
      // 严格检查：禁止发送空字符串
      if (!content || content.length === 0) {
        return; // 没有内容，直接返回
      }
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
      // 立即清空输入框（如果是从快捷回复传入的，不需要清空draft）
      if (text === undefined) {
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
        const isFirstMessage = messages.length === 0;
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
            // 传递 followupSlot 状态（如果存在）
            ...(followupSlotState && { followupSlot: followupSlotState }),
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

        const { response, error: apiError } = await sendChatMessage(
          messageToSend,
          requestPayload.history,
          currentState,
          assessmentStage,
          currentInitialMessage,
          requestPayload.meta,
          // onTextChunk callback
          (textChunk) => {
            // We need to append text to the current message content
            // Assuming textChunk is the specific new token(s)
            // But wait, the sendChatMessage accumulater logic I wrote accumulates locally
            // and onTextChunk is called with the *chunk*.
            // So we need to accumulate state here or just append.
            // Since onTextChunk is called for each parsed chunk, we append.

            // However, we rely on React state/store update.
            // Calling updateMessage repeatedly might be expensive if too frequent?
            // Zustand is fast enough usually.

            // Note: We need access to the CURRENT content of this message to append.
            // But updateMessage uses functional update or we can read from store?
            // Store update is: messages.map(...).
            // Better: updateMessage(id, { content: prevContent + chunk })?
            // No, updateMessage as defined: { ...msg, ...updates }
            // So we need to pass the *new complete content* OR logic to append.
            // My defined updateMessage takes `Partial<Message>`.
            // So I need to know the full content.

            // Let's modify onTextChunk usage.
            // I'll keep a local accumulator in this scope.
          }
        );

        // Wait, I can't interact with the stream inside `sendChatMessage` easily if I await it?
        // `sendChatMessage` provided `onTextChunk`.

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
          }
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
        if (responseData.meta?.followupSlot) {
          setFollowupSlotState(responseData.meta.followupSlot);
        } else if (responseData.state === 'normal' || responseData.assessmentStage === 'conclusion') {
          // 如果进入 conclusion 或 normal 状态，清空 followupSlot
          setFollowupSlotState(undefined);
        }

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

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-slate-50">
      {/* 顶部栏 - 固定高度 */}
      <header className="w-full border-b bg-white shadow-sm z-20 shrink-0">
        <div className="w-full px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">心理疗愈助手</h1>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={handleClearConversation}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors border border-gray-300"
                title="开始新会话"
              >
                新会话
              </button>
            )}
            <button
              onClick={() => setDisclaimerOpen(true)}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              免责声明
            </button>
          </div>
        </div>
      </header>

      {/* 消息列表 - flex-1 滚动容器（修复B: 确保这是唯一的滚动容器） */}
      <section
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain w-full min-h-0"
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
      </section>

      {/* 输入框 - shrink-0 固定在底部（修复B: 不参与滚动） */}
      <footer className="w-full border-t bg-white z-30 shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-full px-4 py-3">
          <ChatInput
            value={draft}
            onChange={(newValue) => {
              // 确保状态更新
              setDraft(newValue);
            }}
            onSend={handleSend}
            isLoading={isLoading || isSending}
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
      {disclaimerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">免责声明</h2>
            <div className="text-sm text-gray-700 space-y-2 mb-4">
              <p>
                本产品仅供学习和研究使用，不能替代专业心理咨询服务。
              </p>
              <p>
                如遇严重心理危机，请立即寻求专业帮助：
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>全国24小时心理危机干预热线：400-161-9995</li>
                <li>如遇紧急情况，请立即拨打 110 或前往就近医院急诊科</li>
              </ul>
            </div>
            <button
              onClick={() => setDisclaimerOpen(false)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
