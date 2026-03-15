'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useChatStore } from '@/store/chatStore';
import { sendChatMessage } from '@/lib/api/chat';
import { Message, SessionStatus } from '@/types/chat';
import { useRouter } from 'next/navigation';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ChatActionProvider } from './ChatContext'; // Imported
import { DebugDrawer } from './DebugDrawer';
import { Modal, Tag, Message as ArcoMessage } from '@arco-design/web-react';
import { hideSession } from '@/lib/actions/chat';
import { TherapistSelector } from './TherapistSelector';
import { BreathingOrb } from './BreathingOrb';
import { MoodBar } from './MoodBar';
import { LeaveDialog } from './LeaveDialog';
import { MoodShiftToast } from './MoodShiftToast';
import { MoodTheme, MOOD_THEMES, emotionToMoodTheme, applyMoodColor, getMoodShiftText } from '@/lib/mood-theme';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

import { Session } from 'next-auth';

const SESSION_DURATION_SECONDS = 45 * 60; // 45 minutes

interface ChatShellProps {
  sessionId?: string;  // 可选 - 未定义表示新会话
  initialMessages: Message[];
  isReadOnly?: boolean;
  initialTimeRemaining?: number; // 服务端计算的剩余时间（秒）
  user?: Session['user']; // 传入完整用户对象用于权限检查
}

export function ChatShell({ sessionId, initialMessages, isReadOnly = false, initialTimeRemaining, user }: ChatShellProps) {
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
    updateMessage,
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
    inputDraft,
    setInputDraft,
    setMessages,
    debugDrawerOpen,
    setDebugDrawerOpen,
    setTransitionMessages,
    getAndClearTransitionMessages,
    currentSessionId,
    setCurrentSessionId,
    sessionStatus,
    setSessionStatus,
    isCreatingSession,
    setCreatingSession,
    // @deprecated: Use sessionStatus instead
    isConsulting,
    setConsulting,
    currentModel,
  } = useChatStore();

  const router = useRouter();
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [showTherapistSelector, setShowTherapistSelector] = useState(false);
  const [therapistChecked, setTherapistChecked] = useState(false);



  // 内部会话ID状态 - 允许懒加载创建
  const [internalSessionId, setInternalSessionId] = useState<string | undefined>(sessionId);

  // 同步内部ID到全局Store，确保重新挂载时持久化
  useEffect(() => {
    if (internalSessionId) {
      setCurrentSessionId(internalSessionId);
    }
  }, [internalSessionId, setCurrentSessionId]);

  // 追踪前一个 sessionId，用于检测导航行为
  const prevSessionIdRef = useRef<string | undefined>(sessionId);
  const sessionIdRef = useRef<string | undefined>(sessionId);
  // Track if we're in the middle of creating a new session (transient state, not persisted)
  // isCreatingSession is now in Zustand store to survive remounts
  // (replaced local isCreatingRef)

  const [isSending, setIsSending] = useState(false);
  // Initial draft from store (if navigating from new chat or switching sessions)
  const [draft, setDraft] = useState(inputDraft || '');
  const scrollContainerRef = useRef<HTMLElement>(null);
  const hasInitializedRef = useRef(false);

  // 情绪主题状态
  const [currentMoodTheme, setCurrentMoodTheme] = useState<MoodTheme>(MOOD_THEMES.default);
  const prevMoodThemeRef = useRef<MoodTheme>(MOOD_THEMES.default);
  const [moodShiftText, setMoodShiftText] = useState<string | null>(null);
  const [moodBarPulse, setMoodBarPulse] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  // 对话计时器（正计时，显示已聊时长）
  const [chatDuration, setChatDuration] = useState(0);
  const chatDurationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ★ 同步初始化：在组件挂载时立即用 props 数据初始化 store，避免等待 useEffect
  // 这是消除闪烁的核心修复：确保首帧渲染就使用正确的数据
  const initializedThisRender = useMemo(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      // 同步调用 store actions，确保首帧就有正确的数据
      console.log('[ChatShell] Sync init on first render', {
        sessionId,
        storeSessionId: useChatStore.getState().currentSessionId,
        msgCount: initialMessages?.length || 0
      });

      const currentStore = useChatStore.getState();

      // ★ 简化逻辑：防止跨会话数据污染：
      // 1. 如果 sessionId (prop) 存在 且 initialMessages 有内容 → 始终使用服务端数据
      // 2. 如果 sessionId 未定义 (新会话) → 检查是否处于 SPA 模式（URL已有ID）
      // 3. 仅在真正的 SPA 竞态条件下保留本地数据

      if (sessionId && initialMessages && initialMessages.length > 0) {
        // Case 1: Existing session with messages - use server data
        console.log('[ChatShell] Using server initialMessages', { sessionId, count: initialMessages.length });
        setMessages(initialMessages);
        setCurrentSessionId(sessionId);
      } else if (!sessionId && !currentStore.isCreatingSession) {
        // Case 2: New Chat mode - clear everything ONLY if not creating
        // The isCreatingSession check prevents clearing during the "gap" when
        // URL was updated via replaceState but sessionId prop is still undefined
        console.log('[ChatShell] ★ New Chat mode - clearing all state');
        setMessages([]);
        setCurrentSessionId(undefined);
        setSessionStatus(undefined);
        setInternalSessionId(undefined); // Also reset local state for header display
        sessionIdRef.current = undefined;
      } else if (!sessionId && currentStore.isCreatingSession) {
        // Case 2b: Creating session - preserve store messages
        console.log('[ChatShell] ★ Creating session - preserving store messages', {
          storeMessages: currentStore.messages.length,
          isCreating: currentStore.isCreatingSession
        });
        // Don't clear anything; the store already has the correct messages
      } else {
        // Case 3: sessionId defined but no initialMessages (server returned empty)
        console.log('[ChatShell] Session with no messages from server', { sessionId });
        setMessages([]);
        setCurrentSessionId(sessionId);
      }

      setError(null);
      setLoading(false);

      // 恢复路由状态 from last message metadata
      if (initialMessages && initialMessages.length > 0) {
        const lastMsg = initialMessages[initialMessages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.metadata) {
          updateState({
            currentState: (lastMsg.metadata as any).state || undefined,
            routeType: lastMsg.metadata.routeType,
            assessmentStage: lastMsg.metadata.assessmentStage
          });
        }
      } else {
        // Reset state if no messages
        updateState({
          currentState: undefined,
          routeType: undefined,
          assessmentStage: undefined,
        });
      }
      return true;
    }
    return false;
    // 故意不用完整依赖数组，只在组件首次挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★ 安全消息显示逻辑：
  // 防止当 Store 包含旧会话消息但 Props 为新（或未定义）时出现“闪烁旧内容”
  // 
  // 显示 Store 消息的条件：
  // 1. Session ID 匹配（正常情况）
  // 2. 都未定义（新会话，尚无 ID）
  // 3. 正在创建会话（创建过程中的瞬态）
  // 4. ★ 新增：internalSessionId 存在但 sessionId prop 未定义 且 Store 有消息
  //    处理 SPA 场景：我们通过 window.history.replaceState 本地创建了会话
  //    但 React props 尚未更新（也不会更新，因为 replaceState 不触发导航）
  const shouldShowStoreMessages =
    (sessionId === internalSessionId) ||
    (!sessionId && !internalSessionId) ||
    (isCreatingSession && internalSessionId && !sessionId) ||
    // ★ SPA-created session: internal ID exists, no prop ID, and we have messages in store
    (!sessionId && internalSessionId && messages.length > 0);

  const displayMessages = shouldShowStoreMessages ? messages : (initialMessages || []);

  // 组件挂载时，强制重置isLoading和isSending为false（防止状态卡住）
  useEffect(() => {
    // 立即重置所有可能卡住的状态
    if (isLoading || isSending) {
      console.log('[ChatShell] Resetting stuck loading state on mount');
      setIsSending(false);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only

  // P5: 首次新对话时，若用户无偏好治疗师则随机分配一个（不弹出选择器）
  useEffect(() => {
    if (!sessionId && !therapistChecked && user) {
      setTherapistChecked(true);
      fetch('/api/user/preferences')
        .then(res => res.json())
        .then(data => {
          if (!data.preferredTherapist) {
            // 随机分配治疗师，不弹出选择器，让用户直接进入聊天
            const therapistIds = ['xiaowarm', 'mingyuan', 'qinghe'];
            const randomId = therapistIds[Math.floor(Math.random() * therapistIds.length)];
            fetch('/api/user/preferences', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ preferredTherapist: randomId }),
            }).catch(() => {}); // 静默失败
          }
        })
        .catch(() => {}); // 静默失败
    }
  }, [sessionId, therapistChecked, user]);

  // Sync draft to store
  useEffect(() => {
    setInputDraft(draft);
  }, [draft, setInputDraft]);

  // Sync ref with prop/state
  useEffect(() => {
    if (internalSessionId) {
      sessionIdRef.current = internalSessionId;
    }
  }, [internalSessionId]);

  // ★ 后续更新：用于处理动态 session 切换（不通过 key prop 重新挂载的情况）
  // 由于我们用 key={sessionId}，所以这个 effect 通常不会触发
  useEffect(() => {
    // 跳过首次挂载（已由 useMemo 处理）
    if (initializedThisRender) {
      return;
    }

    // ★ CRITICAL GUARD: 如果正在发送消息或 loading，不要执行任何会话切换逻辑
    // 这防止了流式响应期间 URL 更新导致消息被清空的问题
    if (isSending || isLoading) {
      console.log('[ChatShell] Skipping session switch - message in progress', { isSending, isLoading });
      return;
    }

    // FIX: 优先检查是否有"过渡态消息"（来自 setTransitionMessages）
    // 这解决了 loading.tsx 导致组件卸载后，本地状态丢失的问题
    const transitionMsgs = sessionId ? getAndClearTransitionMessages(sessionId) : undefined;

    // 动态 session 切换检测
    // FIX: Handle switch to 'undefined' (New Chat) as well
    const isSessionSwitch = (sessionId && sessionId !== internalSessionId) || (!sessionId && internalSessionId);

    // 旧 FIX 保留（作为双重保险）：如果已经有本地消息且是创建过程，不要被服务端覆盖
    const isCreationTransition = !internalSessionId && sessionId && messages.length > 0;

    if (transitionMsgs && transitionMsgs.length > 0) {
      console.log('[ChatShell] Restoring transition messages from store', { count: transitionMsgs.length });
      setMessages(transitionMsgs);
      setInternalSessionId(sessionId);
      sessionIdRef.current = sessionId;
      prevSessionIdRef.current = sessionId;
    } else if (isSessionSwitch) {
      // CRITICAL GUARD: If we just created a session locally (internalSessionId exists)
      // but the router prop (sessionId) is just catching up or mismatched,
      // and we have local messages, DO NOT WIPE THEM.
      if (isCreationTransition) {
        console.log('[ChatShell] Ignoring server props during creation transition (SPA Mode)');
        // ensure internal ID is synced just in case
        if (sessionId) {
          setInternalSessionId(sessionId);
          sessionIdRef.current = sessionId;
          prevSessionIdRef.current = sessionId;
        }
        return;
      }

      console.log('[ChatShell] Switching session, loading new messages', { from: internalSessionId, to: sessionId });

      // If switching to New Chat (!sessionId), reset everything
      // BUT check if we just created it locally (sessionStatus === 'creating'). If so, ignore the mismatch logic.
      if (!sessionId && !isCreatingSession) {
        console.log('[ChatShell] ★ FULL RESET to New Chat mode', {
          prevInternalId: internalSessionId,
          prevSessionIdRef: sessionIdRef.current,
          sessionStatus: sessionStatus
        });

        // ★ COMPREHENSIVE RESET for New Chat
        setMessages([]);
        setInternalSessionId(undefined);
        setCurrentSessionId(undefined); // Sync global store
        sessionIdRef.current = undefined;
        prevSessionIdRef.current = undefined;
        setSessionStatus(undefined); // Reset status for fresh start
        setDraft(inputDraft || ''); // Restore draft if any
        setTimeLeft(SESSION_DURATION_SECONDS); // Reset timer for new session

        // 立即重置 loading 状态，避免等待超时
        setLoading(false);
        setIsSending(false);
        setError(null);

        // Reset conversation state as well
        updateState({
          currentState: undefined,
          routeType: undefined,
          assessmentStage: undefined,
          initialMessage: undefined,
        });
      } else if (!sessionId && isCreatingSession) {
        console.log('[ChatShell] Ignoring reset because session is in CREATING state');
        // Keep timer as is (it's running for the new session)
      } else {
        // If switching to existing session, load initialMessages
        // Reset sessionStatus to active since we're now in an existing session
        setSessionStatus('active');

        // ★ CRITICAL: ALWAYS load server data when switching to existing session.
        // The previous hasLocalDataForSession check was WRONG - it preserved NEW session data
        // when navigating to a HISTORY session (because currentSessionId was the new one).
        // This caused cross-session contamination.
        console.log('[ChatShell] Loading initialMessages for existing session', {
          sessionId,
          msgCount: initialMessages?.length || 0
        });
        setMessages(initialMessages || []);

        setInternalSessionId(sessionId);
        setCurrentSessionId(sessionId); // Sync global store
        sessionIdRef.current = sessionId;
        prevSessionIdRef.current = sessionId;
        setTimeLeft(SESSION_DURATION_SECONDS);
        // 立即重置 loading 状态，避免等待超时
        setLoading(false);
        setIsSending(false);

        if (!initialMessages || initialMessages.length === 0) {
          console.warn('[ChatShell] Switched to session but no messages found', { sessionId });
        }
      }
    }
  }, [sessionId, initialMessages, setMessages, internalSessionId, initializedThisRender, inputDraft, updateState, isCreatingSession]);


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

  // ★ CRITICAL: Reset loading states whenever sessionId prop changes (covers navigation scenarios)
  // This ensures that even if component doesn't remount, navigation always starts clean
  useEffect(() => {
    console.log('[ChatShell] sessionId prop changed, resetting loading states', { sessionId });
    setLoading(false);
    setIsSending(false);
  }, [sessionId, setLoading]);

  // 监听isLoading和isSending，如果异常卡住则自动恢复（备用保护机制）
  // Stage 1: Fast recovery if isLoading but NOT isSending (stream returned but state wasn't reset)
  // Stage 2: Slower recovery if BOTH are stuck (component may have remounted mid-send)
  useEffect(() => {
    if (!isLoading && !isSending) return; // Nothing stuck

    // Determine timeout based on the state
    // If ONLY isLoading is stuck (isSending=false), stream is done, fast recovery
    // If BOTH are stuck, allow more time for remote request to finish (but not too long)
    const timeoutMs = (isLoading && isSending) ? 5000 : 1500;

    const timer = setTimeout(() => {
      if (isLoading || isSending) {
        console.warn('[ChatShell] Loading/Sending state stuck, auto-recovering...', { isLoading, isSending });
        setIsSending(false);
        setLoading(false);
      }
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [isLoading, isSending, setLoading]);

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
          // 从 toolCalls 恢复 actionCards（刷新页面后 actionCards 未持久化到 DB，需从 toolCalls 重建）
          let actionCards = msgData.actionCards;
          const allToolCalls = msgData.toolCalls || (msg as any).toolCalls;
          if (!actionCards && allToolCalls && allToolCalls.length > 0) {
            allToolCalls.forEach((call: any) => {
              try {
                const name = call.toolName || call.function?.name;
                const args = call.args || (typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function?.arguments);
                if (name === 'recommend_skill_card' && args?.card) {
                  if (!actionCards) actionCards = [];
                  actionCards.push(args.card);
                }
              } catch {}
            });
          }
          extras.set(msg.id, {
            routeType: msgData.routeType,
            assessmentStage: msgData.assessmentStage,
            actionCards,
            assistantQuestions: msgData.assistantQuestions,
            validationError: msgData.validationError,
            toolCalls: allToolCalls,
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

  // ★ 45分钟倒计时逻辑 - 使用服务端计算的剩余时间
  // 如果没有传入 initialTimeRemaining（例如新会话），使用默认值
  const [timeLeft, setTimeLeft] = useState(() => {
    // 新会话：使用完整时间
    if (!sessionId) return SESSION_DURATION_SECONDS;
    // 已结束会话：时间为 0
    if (isReadOnly) return 0;
    // 活跃会话：使用服务端计算的剩余时间
    return initialTimeRemaining ?? SESSION_DURATION_SECONDS;
  });

  // ★ 简化：会话结束判断完全由服务端决定（通过 isReadOnly 传入）
  // 前端倒计时只用于 UI 展示，不作为结束的权威来源
  const isSessionEnded = isReadOnly || timeLeft <= 0;

  // 情绪主题追踪：当 AI 回复带有情绪数据时，更新全局主题色
  useEffect(() => {
    const lastAssistantMsg = [...displayMessages].reverse().find(m => m.role === 'assistant' && m.emotion);
    if (lastAssistantMsg?.emotion) {
      const newTheme = emotionToMoodTheme(lastAssistantMsg.emotion.label, lastAssistantMsg.emotion.score);
      if (newTheme.key !== currentMoodTheme.key) {
        const shiftText = getMoodShiftText(currentMoodTheme, newTheme);
        setMoodShiftText(shiftText);
        setMoodBarPulse(true);
        setTimeout(() => setMoodBarPulse(false), 800);

        prevMoodThemeRef.current = currentMoodTheme;
        setCurrentMoodTheme(newTheme);
        applyMoodColor(newTheme.color);
      }
    }
  }, [displayMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  // 初始化情绪色
  useEffect(() => {
    applyMoodColor(currentMoodTheme.color);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 对话计时器：开始有消息后启动正计时
  useEffect(() => {
    if (displayMessages.length > 0 && !isSessionEnded && !chatDurationRef.current) {
      chatDurationRef.current = setInterval(() => {
        setChatDuration(prev => prev + 1);
      }, 1000);
    }
    if (isSessionEnded && chatDurationRef.current) {
      clearInterval(chatDurationRef.current);
      chatDurationRef.current = null;
    }
    return () => {
      if (chatDurationRef.current) {
        clearInterval(chatDurationRef.current);
        chatDurationRef.current = null;
      }
    };
  }, [displayMessages.length, isSessionEnded]);

  const formatDuration = (seconds: number) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

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

  // 会话结束时自动滚动到底部
  useEffect(() => {
    if (isSessionEnded) {
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 300);
    }
  }, [isSessionEnded]);

  // 同步会话状态到全局 Store (用于导航拦截)
  // Note: sessionStatus and isConsulting are INTENTIONALLY excluded from deps to prevent infinite loops.
  // This effect only recalculates when the source values (internalSessionId, isReadOnly, isSessionEnded) change.
  useEffect(() => {
    // Determine the correct status based on current conditions
    // Simplified: only 'active' | 'ended' | undefined
    const currentStatus = useChatStore.getState().sessionStatus;
    let newStatus: SessionStatus | undefined;

    if (isReadOnly || isSessionEnded) {
      newStatus = 'ended';
    } else if (internalSessionId) {
      newStatus = 'active';
    } else {
      newStatus = undefined; // No session
    }

    if (currentStatus !== newStatus) {
      setSessionStatus(newStatus);
    }

    // Also keep deprecated isConsulting in sync
    const currentIsConsulting = useChatStore.getState().isConsulting;
    const shouldBeConsulting = newStatus === 'active';
    if (currentIsConsulting !== shouldBeConsulting) {
      setConsulting(shouldBeConsulting);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internalSessionId, isReadOnly, isSessionEnded, setSessionStatus, setConsulting]);

  useEffect(() => {
    return () => {
      // 组件卸载时，如果不是在创建新会话的过程中，则重置状态
      if (!isCreatingSession) {
        setSessionStatus(undefined);
        setConsulting(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSessionStatus, setConsulting]);

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
          setCreatingSession(true); // 先标记创建中，防止初始化 effect 在 await 期间清空消息
          const { createNewSessionAndReturnId, updateSessionTitle } = await import('@/lib/actions/chat');
          currentSessionId = await createNewSessionAndReturnId();

          // Await title update to ensure persistence before proceeding (fast enough)
          // Also fixes the bug where title stays "New Session" if user navigates away quickly
          await updateSessionTitle(currentSessionId, content).catch(console.error);

          sessionIdRef.current = currentSessionId;
          setSessionStatus('active'); // Set status to active immediately
          setInternalSessionId(currentSessionId);
          // 防护：仅当 sessionId 有效时才更新 URL
          if (currentSessionId && currentSessionId !== 'undefined') {
            // CRITICAL FIX: 在跳转前，将当前的完整消息列表（含用户消息+思考中占位符）保存到全局 Store
            // 这样即使 loading.tsx 导致 ChatShell 卸载，新实例也能从 Store 恢复状态
            const tempMessages = [...messages, userMessage];

            setTransitionMessages(currentSessionId, [...messages, userMessage]);

            // Revert back to window.history.replaceState for SPA feel.
            window.history.replaceState(null, '', `/c/${currentSessionId}`);
          } else {
            console.error('[ChatShell] Attempted to update URL with invalid sessionId:', currentSessionId);
          }
        } catch (err) {
          console.error('[ChatShell] Session creation error:', err);
          setIsSending(false);
          setLoading(false);
          setError('创建会话失败，请刷新页面重试');
          // 确保 currentSessionId 不会有脏值
          currentSessionId = undefined;
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
          content: '正在深入思考...',
          timestamp: new Date().toISOString(),
        };
        addMessage(placeholderMessage);

        let localAccumulatedContent = '';
        // Capture metadata progressively to ensure no data loss on final update
        let capturedSafety: any = null;
        let capturedState: any = null;
        let capturedActionCards: any[] | undefined = undefined;

        console.log('[ChatShell] Calling sendChatMessage...', { sessionId: currentSessionId });
        const { response: finalResponse, error: finalApiError } = await sendChatMessage({
          message: messageToSend,
          history: requestPayload.history,
          state: currentState,
          assessmentStage,
          initialMessage: currentInitialMessage,
          meta: requestPayload.meta,
          sessionId: currentSessionId,
          model: currentModel,
          onTextChunk: (chunk) => {
            if (chunk) {
              localAccumulatedContent += chunk;
              updateMessage(assistantMsgId, { content: localAccumulatedContent });
            }
          },
          onDataChunk: (data) => {
            // Update captured metadata
            if (data.safety) capturedSafety = data.safety;
            if (data.state) capturedState = data.state;
            if (data.actionCards) capturedActionCards = data.actionCards;

            updateMessage(assistantMsgId, {
              metadata: {
                safety: data.safety || capturedSafety,
                state: data.state || capturedState,
                routeType: data.routeType,
                assessmentStage: data.assessmentStage,
                actionCards: data.actionCards || capturedActionCards,
                assistantQuestions: data.assistantQuestions,
                validationError: data.validationError,
                toolCalls: data.toolCalls,
                persona: data.persona,
                memory: data.memory,
                adaptiveMode: data.adaptiveMode,
              }
            } as any);
          },
        });
        console.log('[ChatShell] sendChatMessage returned', { hasError: !!finalApiError });

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
          setIsSending(false);
          setLoading(false);
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
          setIsSending(false);
          setLoading(false);
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
            actionCards: responseData.actionCards || capturedActionCards,
            assistantQuestions: responseData.assistantQuestions,
            validationError: responseData.validationError,
            toolCalls: responseData.toolCalls,
            // MERGE: Ensure we don't lose safety/state if responseData misses them
            safety: responseData.safety || capturedSafety,
            state: responseData.state || capturedState,
            // MERGE: Preserve persona/memory data from stream
            persona: responseData.persona,
            memory: responseData.memory,
            adaptiveMode: responseData.adaptiveMode,
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
        console.log('[ChatShell] handleSend finally block executing, resetting loading states');
        setIsSending(false);
        setLoading(false);
        setCreatingSession(false); // Reset creating flag
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
    <ChatActionProvider value={{ sendMessage: (content) => handleSend(content), isLoading }}>
      <div
        className="h-[100dvh] w-full flex flex-col overflow-hidden bg-gray-50 relative"
        style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100%', overflow: 'hidden', position: 'relative' }}
      >

        {/* 情绪渐变条 */}
        <MoodBar pulse={moodBarPulse} />

        {/* 环境光晕 */}
        <div className="ambient-light" />
        <div className="ambient-light-2" />

        {/* 顶部栏 */}
        <header
          className="w-full bg-white border-b border-gray-100/80 z-20 shrink-0 pt-[env(safe-area-inset-top,0px)]"
          style={{ flexShrink: 0, width: '100%', zIndex: 20 }}
        >
          <div className="w-full px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 flex-1 relative">
              <BreathingOrb theme={currentMoodTheme} />
              <div>
                <h1 className="text-[15px] font-semibold text-gray-800 leading-tight">心灵树洞</h1>
                <div className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{isSessionEnded ? '已结束' : '倾听中'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3.5 shrink-0">
              {/* 对话计时 — 已完成会话显示总时长，进行中显示计时 */}
              {(isReadOnly || isSessionEnded) ? (
                displayMessages.length >= 2 && (() => {
                  const first = displayMessages[0]?.timestamp;
                  const last = displayMessages[displayMessages.length - 1]?.timestamp;
                  if (!first || !last) return null;
                  const dur = Math.floor((new Date(last).getTime() - new Date(first).getTime()) / 1000);
                  return (
                    <div className="text-xs text-gray-400 flex items-center gap-1 font-mono tabular-nums">
                      <span>⏱</span>
                      <span>{formatDuration(dur)}</span>
                    </div>
                  );
                })()
              ) : (
                <div className={`text-xs text-gray-400 flex items-center gap-1 font-mono tabular-nums transition-opacity duration-300 ${displayMessages.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
                  <span>⏱</span>
                  <span>{formatDuration(chatDuration)}</span>
                </div>
              )}
              {/* 离开按钮 */}
              {!isReadOnly && !isSessionEnded && (
                <button
                  onClick={() => {
                    // 无会话ID或空会话（0条消息）直接返回，不弹确认框
                    if (!internalSessionId || messages.length === 0) {
                      if (internalSessionId) {
                        hideSession(internalSessionId).catch(() => {});
                      }
                      resetConversation();
                      router.push('/');
                      return;
                    }
                    setShowLeaveDialog(true);
                  }}
                  className="px-4 py-[7px] rounded-[10px] border border-gray-200 bg-white text-[13px] text-gray-500 cursor-pointer flex items-center gap-1.5 transition-all duration-200 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97]"
                >
                  <span>←</span> 离开
                </button>
              )}
              {(isReadOnly || isSessionEnded) && (
                <>
                  <Tag color="gray" size="small" className="!rounded-xl">已结束</Tag>
                  <button
                    onClick={() => router.push('/')}
                    className="px-3 py-[6px] rounded-[10px] border border-gray-200 bg-white text-[13px] text-gray-500 cursor-pointer flex items-center gap-1 transition-all duration-200 hover:bg-gray-50"
                  >
                    ← 返回
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* P5: 治疗师选择器（仅手动打开时显示，不再首次自动弹出） */}
        {showTherapistSelector && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-50/95 backdrop-blur-sm">
            <TherapistSelector
              onSelect={() => setShowTherapistSelector(false)}
              onSkip={() => setShowTherapistSelector(false)}
            />
          </div>
        )}

        {/* 消息列表 */}
        <section
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overscroll-contain w-full min-h-0 scrollbar-thin"
          style={{ flex: 1, overflowY: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}
        >
          <MessageList
            messages={displayMessages}
            isLoading={isLoading}
            isSending={isSending}
            messageExtras={messageExtras}
            onSendMessage={handleSend}
            scrollContainerRef={scrollContainerRef}
            sessionId={internalSessionId || sessionIdRef.current || ''}
          />
          {isSessionEnded && (
            <div className="mx-4 mb-8 py-6 text-center animate-in fade-in duration-500">
              <p className="text-sm text-gray-400">本次对话已结束，感谢你的信任</p>
            </div>
          )}
        </section>

        {/* 输入框 */}
        <footer
          className="w-full z-30 shrink-0 pb-[env(safe-area-inset-bottom)]"
          style={{ flexShrink: 0, width: '100%', zIndex: 30 }}
        >
          <div className="mx-auto w-full max-w-4xl px-4 pt-1 pb-2">
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
              showDisclaimer={true}
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

        {/* 离开确认弹窗 */}
        <LeaveDialog
          visible={showLeaveDialog}
          moodTheme={currentMoodTheme}
          onStay={() => setShowLeaveDialog(false)}
          onLeave={async () => {
            setShowLeaveDialog(false);
            setTimeLeft(0);
            ArcoMessage.success('对话已完成');
            // 返回会话列表
            router.push('/');
          }}
        />

        {/* 情绪变化 Toast */}
        <MoodShiftToast text={moodShiftText} />

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
            <p>3. 如果你感到非常难受或有紧急情况，请联系专业帮助或拨打急救电话。</p>
            <p>4. 您的对话记录会被加密保存，仅您本人可见。</p>
          </div>
        </Modal>
      </div>
    </ChatActionProvider>
  );
}
