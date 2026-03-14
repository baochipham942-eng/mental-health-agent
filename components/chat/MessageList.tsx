'use client';

import { Message } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { useHasHydrated } from '@/store/chatStore';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  isSending?: boolean;
  messageExtras?: Map<string, {
    routeType?: 'crisis' | 'assessment' | 'support';
    assessmentStage?: 'intake' | 'gap_followup' | 'conclusion';
    actionCards?: any[];
    assistantQuestions?: string[];
    validationError?: {
      actionCards?: string;
      nextStepsLines?: string;
    };
    toolCalls?: any[];
  }>;
  onSendMessage?: (text: string) => void;
  scrollContainerRef?: RefObject<HTMLElement>;
  sessionId: string;
}

// 简单的时间问候语
function getTimeGreeting(): { greeting: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { greeting: '夜深了', emoji: '🌙' };
  if (hour < 9) return { greeting: '早上好', emoji: '🌅' };
  if (hour < 12) return { greeting: '上午好', emoji: '☀️' };
  if (hour < 14) return { greeting: '中午好', emoji: '🌤️' };
  if (hour < 18) return { greeting: '下午好', emoji: '🌇' };
  if (hour < 22) return { greeting: '晚上好', emoji: '🌆' };
  return { greeting: '夜深了', emoji: '🌙' };
}

const COMFORT_MESSAGES = [
  '正在认真思考你说的话...',
  '每一种情绪都值得被看见',
  '慢慢来，我在这里陪着你',
];

function ThinkingIndicator() {
  const [comfortIndex, setComfortIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setComfortIndex(prev => (prev + 1) % COMFORT_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-2 mb-6 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
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
            <span className="text-xs thinking-comfort-text italic whitespace-nowrap transition-all duration-700 block">
              {COMFORT_MESSAGES[comfortIndex]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageList({ messages, isLoading, isSending, messageExtras, onSendMessage, scrollContainerRef, sessionId }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 防护日志：帮助调试 sessionId 问题
  if (!sessionId && messages.length > 0) {
    console.warn('[MessageList] Rendering messages without valid sessionId');
  }

  const endRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const lastMessageCountRef = useRef(messages.length);
  const lastMessageRoleRef = useRef<string | null>(
    messages.length > 0 ? messages[messages.length - 1].role : null
  );

  // 等待 Zustand 水合完成，避免闪烁
  const hasHydrated = useHasHydrated();

  // 获取滚动容器
  const getScrollContainer = useCallback((): HTMLElement | null => {
    if (scrollContainerRef?.current) {
      return scrollContainerRef.current;
    }
    if (!containerRef.current) return null;
    let parent = containerRef.current.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        return parent as HTMLElement;
      }
      parent = parent.parentElement;
    }
    return null;
  }, [scrollContainerRef]);

  // 检查是否接近底部
  const checkIfNearBottom = useCallback(() => {
    const container = getScrollContainer();
    if (!container) return false;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= 120;
  }, [getScrollContainer]);

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    const container = getScrollContainer();
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    } else if (endRef.current) {
      endRef.current.scrollIntoView({ behavior });
    }
  }, [getScrollContainer]);

  // 处理滚动事件
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;
    const handleScroll = () => {
      setShowScrollToBottom(!checkIfNearBottom());
    };
    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIfNearBottom, getScrollContainer]);

  // 自动滚动逻辑
  useEffect(() => {
    const isNewMessage = messages.length !== lastMessageCountRef.current;
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const isNewUserMessage = lastMessage && lastMessage.role === 'user' && lastMessageRoleRef.current !== 'user';
    const isNewAssistantMessage = lastMessage && lastMessage.role === 'assistant' && lastMessageRoleRef.current !== 'assistant';

    if (isNewMessage || isNewUserMessage || isNewAssistantMessage) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom('smooth');
          setShowScrollToBottom(false);
        }, 100);
      });
      lastMessageCountRef.current = messages.length;
      if (lastMessage) {
        lastMessageRoleRef.current = lastMessage.role;
      }
    } else if (isLoading || isSending) {
      if (checkIfNearBottom()) {
        requestAnimationFrame(() => scrollToBottom('smooth'));
      } else {
        setShowScrollToBottom(true);
      }
    }
  }, [messages, isLoading, isSending, checkIfNearBottom, scrollToBottom]);

  // 初始滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        setTimeout(() => scrollToBottom('auto'), 0);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 检查是否是回访用户（仅客户端）
  const [isReturningUser, setIsReturningUser] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasVisited = localStorage.getItem('hasVisited') === 'true';
      setIsReturningUser(hasVisited);
      localStorage.setItem('hasVisited', 'true');
    }
  }, []);

  // ============== 极简逻辑 ==============
  // 场景0: 未水合完成 -> 显示空白（避免闪烁）
  // 场景1: 有消息 -> 显示消息列表
  // 场景2: 无消息但正在加载/发送 -> 显示加载状态
  // 场景3: 无消息且不在加载 -> 显示欢迎界面

  // 水合检查：避免在 store 恢复数据前显示欢迎界面导致闪烁
  if (!hasHydrated) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-8 opacity-0">
        {/* 水合完成前保持空白不可见 */}
      </div>
    );
  }

  if (messages.length === 0) {
    // 无消息，显示欢迎界面（发送首条消息时，消息会立即显示，无需特殊处理）
    const { greeting, emoji } = getTimeGreeting();
    const examplePrompts = [
      '最近感觉压力有点大...',
      '晚上总是睡不好觉',
      '想和你聊聊最近的心情',
    ];

    return (
      <div className="w-full h-full min-h-[60vh] max-w-4xl mx-auto px-4 py-8 welcome-content flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">
            {isReturningUser ? '欢迎回来 👋' : `${greeting} ${emoji}`}
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {isReturningUser
              ? '很高兴再次见到你，有什么想聊的吗？'
              : '这里是一个安全、私密的空间，你可以随时倾诉你的感受和困扰。'
            }
          </p>

          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 mb-4 text-left">
            <p className="text-xs font-medium text-indigo-600 mb-2">💡 不知道说什么？试试这些：</p>
            <div className="space-y-2">
              {examplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage?.(prompt)}
                  className="w-full text-left px-3 py-2 bg-white rounded-xl text-sm text-gray-700 hover:bg-indigo-100 hover:text-indigo-700 transition-colors shadow-sm"
                >
                  &quot;{prompt}&quot;
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400">
            🔒 你的对话将被安全保存
          </p>
        </div>
      </div>
    );
  }

  // 有消息，显示消息列表
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 pb-32" ref={containerRef}>
      <div className="relative w-full space-y-2 min-h-full">
        {messages.map((message) => {
          const extras = messageExtras?.get(message.id);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              routeType={extras?.routeType}
              assessmentStage={extras?.assessmentStage}
              toolCalls={extras?.toolCalls}
              sessionId={sessionId}
              actionCards={extras?.actionCards}
              assistantQuestions={extras?.assistantQuestions}
              validationError={extras?.validationError}
              onSendMessage={onSendMessage}
              isSending={isSending}
            />
          );
        })}

        {/* 即时 thinking 动画：用户发完消息后立刻显示，不等 API 首 token */}
        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <ThinkingIndicator />
        )}

        <div ref={endRef} />

        {showScrollToBottom && (
          <button
            onClick={() => {
              scrollToBottom('smooth');
              setShowScrollToBottom(false);
            }}
            className="fixed bottom-32 right-4 z-40 px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl shadow-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            回到最新
          </button>
        )}
      </div>
    </div>
  );
}
