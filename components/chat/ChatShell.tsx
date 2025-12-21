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

import { Session } from 'next-auth';

interface ChatShellProps {
  sessionId?: string;  // Optional - undefined for new chat
  initialMessages: Message[];
  isReadOnly?: boolean;
  user?: Session['user']; // Pass entire user object for permission checks
}

export function ChatShell({ sessionId, initialMessages, isReadOnly = false, user }: ChatShellProps) {
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

  // 追踪前一个 sessionId，用于检测导航行为
  const prevSessionIdRef = useRef<string | undefined>(sessionId);
  const sessionIdRef = useRef<string | undefined>(sessionId);

  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollContainerRef = useRef<HTMLElement>(null);

  // Sync ref with prop/state
  useEffect(() => {
    if (internalSessionId) {
      sessionIdRef.current = internalSessionId;
    }
  }, [internalSessionId]);

  // Hydrate Store on Mount / Session Change
  // 简化逻辑：消息不再persist，完全依赖props和实时添加
  useEffect(() => {
    const isSessionSwitch = sessionId && internalSessionId && sessionId !== internalSessionId;

    // 1. 会话切换：完全重置，使用服务端数据
    if (isSessionSwitch) {
      console.log('[ChatShell] Session switch detected', { old: internalSessionId, new: sessionId });
      setMessages(initialMessages || []);
      setInternalSessionId(sessionId);
      sessionIdRef.current = sessionId;
      setError(null);
      setLoading(false);
      setIsSending(false);
      updateState({
        currentState: undefined,
        routeType: undefined,
        assessmentStage: undefined,
      });
      return;
    }

    // 2. 新会话（无sessionId）：检测resetConversation触发的重置
    if (!sessionId && internalSessionId && messages.length === 0) {
      console.log('[ChatShell] New session detected, clearing internalSessionId');
      setInternalSessionId(undefined);
      sessionIdRef.current = undefined;
      return;
    }

    // 3. 历史会话加载：首次挂载时用props初始化（仅当本地为空）
    if (sessionId && initialMessages && initialMessages.length > 0 && messages.length === 0) {
      console.log('[ChatShell] Initializing with server messages', { count: initialMessages.length });
      setMessages(initialMessages);
      setInternalSessionId(sessionId);
      sessionIdRef.current = sessionId;

      // 恢复最后一条消息的状态
      const lastMsg = initialMessages[initialMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.metadata) {
        updateState({
          currentState: (lastMsg.metadata as any).state || undefined,
          routeType: lastMsg.metadata.routeType,
          assessmentStage: lastMsg.metadata.assessmentStage
        });
      }
    }
  }, [internalSessionId, sessionId, initialMessages, setMessages, messages.length, updateState, setError, setLoading, setIsSending]);


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
  // 监听isLoading和isSending，如果异常卡住则自动恢复
  useEffect(() => {
    // 如果isLoading为true但isSending为false超过30秒，说明可能卡住了 (修正：从3秒延长到30秒)
    if (isLoading && !isSending) {
      const timer = setTimeout(() => {
        console.warn('检测到isLoading异常卡住，正在自动恢复...');
        setLoading(false);
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isSending, setLoading]);

  const handleEndSession = useCallback(() => {
    Modal.confirm({
      title: <div style={{ textAlign: 'center', width: '100%' }}>确定要结束当前咨询吗？</div>,
      content: <div style={{ textAlign: 'center', color: '#4b5563' }}>结束后将返回列表页，当前对话记录会被保存。</div>,
      okText: '确定结束',
      cancelText: '继续咨询',
      icon: null, // 不显示图标
      style: { width: 400 },
      onOk: () => {
        // 1. Clear local store
        resetConversation();
        setDraft('');
        setIsSending(false);
        setLoading(false);
        setError(null);

        // 2. Reset session ID state and ref
        setInternalSessionId(undefined);
        sessionIdRef.current = undefined;

        // 3. Redirect to dashboard list
        router.push('/dashboard');
      },
    });
  }, [resetConversation, setLoading, setError, router]);

  // 构建 messageExtras Map，用于传递额外的 props 给 MessageBubble
  // Use a stable key that changes when any message metadata changes
  const messagesMetadataKey = useMemo(() => {
    return JSON.stringify(messages.map(m => ({
      id: m.id,
      hasMetadata: !!(m as any).metadata,
      actionCardsCount: (m as any).metadata?.actionCards?.length || 0,
    })));
  }, [messages]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, messagesMetadataKey]);

  // 收集所有 assistant 消息的情绪信息（用于 Debug 面板）
  const emotions = useMemo(() => {
    return messages
      .filter((msg: Message) => msg.role === 'assistant' && msg.emotion)
      .map((msg: Message) => ({
        messageId: msg.id,
        emotion: msg.emotion!,
      }));
  }, [messages]);


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

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text !== undefined ? text : draft).trim();

      console.log('[ChatShell] handleSend called', {
        textArg: text,
        draftValue: draft,
        finalContent: content,
        sessionId: internalSessionId,
        isSendingState: isSending,
        isLoadingState: isLoading
      });

      if (isReadOnly || isSessionEnded) return;
      if (!content || content.length === 0) return;
      if (isLoading || isSending) return;

      const originalContent = content;
      let currentSessionId = internalSessionId || sessionIdRef.current;
      const isFirstMessage = messages.length === 0;

      const messageHistory = messages.map((msg: Message) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      // 先设置发送状态，再添加消息，避免一帧的竞争条件导致UI闪烁
      setIsSending(true);
      setLoading(true);
      setError(null);
      setDraft(''); // 立即清空输入框，提升用户体验
      addMessage(userMessage);

      if (!currentSessionId) {
        try {
          const { createNewSessionAndReturnId, updateSessionTitle } = await import('@/lib/actions/chat');
          currentSessionId = await createNewSessionAndReturnId();

          updateSessionTitle(currentSessionId, content)
            .catch(console.error);

          sessionIdRef.current = currentSessionId;
          setInternalSessionId(currentSessionId);
          window.history.replaceState(null, '', `/dashboard/${currentSessionId}`);
        } catch (err) {
          console.error('[ChatShell] Session creation error:', err);
          setIsSending(false);
          setLoading(false);
          setError('创建会话失败，请刷新页面重试');
          return;
        }
      }

      // Draft already cleared above when sending started

      let messageToSend: string;
      let currentInitialMessage: string | undefined;

      if (currentState === 'awaiting_followup') {
        const updatedDraft = followupAnswerDraft
          ? `${followupAnswerDraft}\n${content.trim()}`
          : content.trim();
        appendFollowupAnswer(content.trim());
        messageToSend = updatedDraft;
        currentInitialMessage = initialMessage;
      } else {
        clearFollowupAnswer();
        currentInitialMessage = isFirstMessage ? content.trim() : initialMessage;
        messageToSend = content.trim();
      }

      try {
        const requestPayload: any = {
          message: messageToSend,
          history: messageHistory,
          state: currentState,
          assessmentStage,
          meta: {
            ...(currentInitialMessage && { initialMessage: currentInitialMessage }),
          },
        };

        setLastRequestPayload(requestPayload);

        const assistantMsgId = generateId();
        const placeholderMessage: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: '好的，我在听。让我整理一下思绪，马上回复你...',
          timestamp: new Date().toISOString(),
        };
        addMessage(placeholderMessage);

        let localAccumulatedContent = '';

        const { response: finalResponse, error: finalApiError } = await sendChatMessage({
          message: messageToSend,
          history: requestPayload.history,
          state: currentState,
          assessmentStage,
          initialMessage: currentInitialMessage,
          meta: requestPayload.meta,
          sessionId: currentSessionId,
          onTextChunk: (chunk) => {
            if (chunk) {
              localAccumulatedContent += chunk;
              updateMessage(assistantMsgId, { content: localAccumulatedContent });
            }
          },
          onDataChunk: (data) => {
            updateMessage(assistantMsgId, {
              metadata: {
                routeType: data.routeType,
                assessmentStage: data.assessmentStage,
                actionCards: data.actionCards,
                assistantQuestions: data.assistantQuestions,
                validationError: data.validationError,
                toolCalls: data.toolCalls,
              }
            } as any);
          },
        });

        if (finalApiError) {
          setDraft(originalContent);
          updateMessage(assistantMsgId, {
            content: `发送失败：${finalApiError.error}。你的消息已恢复到输入框，可以点击重试。`,
            metadata: {
              error: true,
              errorCode: (finalApiError as any).details || 'UNKNOWN_ERROR',
              originalError: finalApiError.error,
              isSystemError: true,
            }
          } as any);
          setError(finalApiError.error);
          return;
        }

        if ((!finalResponse.reply || finalResponse.reply.trim() === '') && localAccumulatedContent.trim().length > 0) {
          finalResponse.reply = localAccumulatedContent;
        }

        const responseData = finalResponse;
        const isEmptyReply = !responseData.reply || responseData.reply.trim() === '';
        const hasStructuredContent = (responseData.actionCards && responseData.actionCards.length > 0) ||
          (responseData.assistantQuestions && responseData.assistantQuestions.length > 0) ||
          (responseData.toolCalls && responseData.toolCalls.length > 0);

        if (isEmptyReply && !hasStructuredContent) {
          setDraft(originalContent);
          updateMessage(assistantMsgId, {
            content: '发送失败：服务器返回了空回复。你的消息已恢复到输入框，可以点击重试。',
            metadata: {
              error: true,
              errorCode: 'EMPTY_REPLY_NO_STRUCTURE',
              isSystemError: true,
            }
          } as any);
          setError('服务器返回了空回复');
          return;
        }

        if (isEmptyReply && hasStructuredContent) {
          responseData.reply = '请查看下方的建议：';
          updateMessage(assistantMsgId, { content: responseData.reply });
        }

        updateMessage(assistantMsgId, {
          content: responseData.reply,
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

        updateState({
          currentState: responseData.state,
          routeType: responseData.routeType,
          assessmentStage: responseData.assessmentStage,
          initialMessage: currentInitialMessage,
        });

        if (responseData.state === 'normal' || responseData.assessmentStage === 'conclusion') {
          clearFollowupAnswer();
        } else if (responseData.state === 'awaiting_followup' && currentState !== 'awaiting_followup') {
          clearFollowupAnswer();
        }

        if (responseData.debugPrompts) setDebugPrompts(responseData.debugPrompts);
        if (responseData.validationError) setValidationError(responseData.validationError);

      } catch (err: any) {
        console.error('[ChatShell] handleSend error:', err);
        setDraft(originalContent);
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `抱歉，发送过程中出现了未预料的错误：${err.message}。请检查控制台或稍后重试。`,
          timestamp: new Date().toISOString(),
          metadata: { error: true, isSystemError: true }
        } as any);
        setError(err.message);
      } finally {
        setIsSending(false);
        setLoading(false);
      }
    },
    [
      draft,
      messages,
      isLoading,
      isSending,
      isReadOnly,
      isSessionEnded,
      internalSessionId,
      currentState,
      assessmentStage,
      initialMessage,
      followupAnswerDraft,
      addMessage,
      updateMessage,
      setIsSending,
      setLoading,
      setError,
      updateState,
      appendFollowupAnswer,
      clearFollowupAnswer,
      setLastRequestPayload,
      setDraft,
      setDebugPrompts,
      setValidationError,
      router,
    ]
  );


  return (
    <div
      className="h-[100dvh] w-full flex flex-col overflow-hidden bg-slate-50 relative"
      style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden', position: 'relative' }}
    >

      {/* 顶部栏 - 固定高度，使用固定布局避免闪烁 */}
      <header
        className="w-full bg-white/80 backdrop-blur-sm border-b border-gray-100 z-20 shrink-0"
        style={{ flexShrink: 0, width: '100%', zIndex: 20, backgroundColor: 'rgba(255,255,255,0.8)' }}
      >
        <div className="w-full max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 transition-all duration-300" title={internalSessionId ? `会话 ID: ${internalSessionId}` : undefined}>
              <span className="text-xl transition-all duration-300">{isReadOnly ? '📋' : internalSessionId ? '💬' : '✨'}</span>
              <h1 className="text-lg font-semibold text-gray-800 transition-all duration-300">
                {isReadOnly ? '历史会话' : internalSessionId ? '咨询中' : '新咨询'}
              </h1>
            </div>
            {/* 倒计时 - 使用 opacity 控制显示，保持布局空间 */}
            <div className={`transition-opacity duration-300 ${!isReadOnly && !isSessionEnded && internalSessionId ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <Tag
                color={timeLeft < 300 ? 'red' : 'arcoblue'}
                size="small"
                className="font-mono"
              >
                ⏱️ 剩余 {formatTime(timeLeft)}
              </Tag>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-[80px] justify-end">
            {isReadOnly ? (
              <Tag color="gray" size="small">咨询已结束</Tag>
            ) : (
              // 使用 opacity 过渡，避免按钮突然出现导致布局跳动
              <div className={`transition-opacity duration-300 ${internalSessionId ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <Button
                  size="small"
                  icon={<IconStop />}
                  onClick={handleEndSession}
                >
                  结束咨询
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 消息列表 - flex-1 滚动容器 */}
      <section
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain w-full min-h-0 scrollbar-thin"
        style={{ flex: 1, overflowY: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}
      >
        <MessageList
          messages={messages}
          isLoading={isLoading}
          isSending={isSending}
          messageExtras={messageExtras}
          onSendMessage={(text: string) => handleSend(text)}
          scrollContainerRef={scrollContainerRef}
          sessionId={internalSessionId || sessionIdRef.current || ''}
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
      <footer
        className="w-full bg-slate-50 z-30 shrink-0 pb-[env(safe-area-inset-bottom)] border-t border-gray-100"
        style={{ flexShrink: 0, width: '100%', zIndex: 30, backgroundColor: '#f8fafc' }}
      >
        <div className="mx-auto w-full max-w-4xl px-4 py-3">
          <ChatInput
            key={internalSessionId || 'new-session'}
            value={draft}
            onChange={(newValue) => {
              setDraft(newValue);
            }}
            onSend={handleSend}
            isLoading={isLoading || isSending}
            disabled={isReadOnly || isSessionEnded}
            placeholder={isSessionEnded ? "本次会话已结束" : undefined}
            autoFocus={!isReadOnly && !isSessionEnded}
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
        user={user}
      />

      {/* 免责声明弹窗 */}
      <Modal
        title="免责声明"
        visible={disclaimerOpen}
        onOk={() => setDisclaimerOpen(false)}
        onCancel={() => setDisclaimerOpen(false)}
        okText="我已知晓"
        hideCancel
        style={{ width: '400px', maxWidth: '90vw' }}
      >
        <div className="text-gray-600 space-y-2">
          <p>1. 本 AI 助手基于大语言模型，提供的回答仅供参考。</p>
          <p>2. AI 可能会产生错误或误导性的信息。</p>
          <p>3. 如果您遇到严重的心理困扰或危机情况，请立即寻求专业医生的帮助或拨打急救电话。</p>
          <p>4. 您的对话记录会被加密保存，仅您本人可见。</p>
        </div>
      </Modal>
    </div>
  );
}
