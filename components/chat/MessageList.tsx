'use client';

import { Message } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { useEffect, useRef, useState, useCallback, RefObject } from 'react';

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
  }>;
  onSendMessage?: (text: string) => void;
  scrollContainerRef?: RefObject<HTMLElement>;
}

export function MessageList({ messages, isLoading, isSending, messageExtras, onSendMessage, scrollContainerRef }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const lastMessageCountRef = useRef(messages.length);
  const lastMessageRoleRef = useRef<string | null>(
    messages.length > 0 ? messages[messages.length - 1].role : null
  );

  // 获取滚动容器：优先使用传入的 ref，否则降级查找
  const getScrollContainer = useCallback((): HTMLElement | null => {
    if (scrollContainerRef?.current) {
      return scrollContainerRef.current;
    }
    // 降级方案：查找父容器
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
    return distanceFromBottom <= 120; // 距离底部120px以内认为接近底部
  }, [getScrollContainer]);

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    const container = getScrollContainer();
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    } else if (endRef.current) {
      // 降级方案：如果找不到滚动容器，使用 scrollIntoView
      endRef.current.scrollIntoView({ behavior });
    }
  }, [getScrollContainer]);

  // 处理滚动事件
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;

    const handleScroll = () => {
      const isNearBottom = checkIfNearBottom();
      setShowScrollToBottom(!isNearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    // 初始检查一次
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIfNearBottom, getScrollContainer]);

  // 自动滚动逻辑（智能滚动：仅当用户接近底部时才自动滚动）
  useEffect(() => {
    const isNewMessage = messages.length !== lastMessageCountRef.current;
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const isNewUserMessage = lastMessage && lastMessage.role === 'user' && lastMessageRoleRef.current !== 'user';
    const isNewAssistantMessage = lastMessage && lastMessage.role === 'assistant' && lastMessageRoleRef.current !== 'assistant';

    // 触发自动滚动的条件：
    // 1. 新消息（User 或 Assistant）：强制滚动到底部
    // 2. 流式更新（Loading/Sending）：只有在用户接近底部时才跟随滚动
    if (isNewMessage || isNewUserMessage || isNewAssistantMessage) {
      // 新消息出现，强制滚动
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom('smooth');
          setShowScrollToBottom(false);
        }, 100);
      });

      // 更新 ref
      lastMessageCountRef.current = messages.length;
      if (lastMessage) {
        lastMessageRoleRef.current = lastMessage.role;
      }
    } else if (isLoading || isSending) {
      // 流式输出或发送中：检查是否跟随
      const shouldAutoScroll = checkIfNearBottom();
      if (shouldAutoScroll) {
        requestAnimationFrame(() => {
          scrollToBottom('smooth');
        });
      } else {
        setShowScrollToBottom(true);
      }
    }
  }, [messages, isLoading, isSending, checkIfNearBottom, scrollToBottom]);

  // 初始滚动到底部（仅在组件首次挂载且有消息时）
  useEffect(() => {
    if (messages.length > 0) {
      // 使用 requestAnimationFrame + setTimeout 确保 DOM 渲染完成后再滚动
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom('auto');
        }, 0);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅在挂载时执行一次

  if (messages.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-2 font-semibold text-gray-700">👋 你好，我是你的心理疗愈助手</p>
          <p className="text-sm text-gray-600">可以随时和我聊聊你的感受和困扰</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-4 pb-6" ref={containerRef}>
      <div className="relative w-full space-y-2 min-h-full">
        {messages.map((message) => {
          const extras = messageExtras?.get(message.id);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              routeType={extras?.routeType}
              assessmentStage={extras?.assessmentStage}
              actionCards={extras?.actionCards}
              assistantQuestions={extras?.assistantQuestions}
              validationError={extras?.validationError}
              onSendMessage={onSendMessage}
              isSending={isSending}
            />
          );
        })}

        <div ref={endRef} />

        {/* 回到底部按钮（修复B: 调整位置，避免被输入框遮挡） */}
        {showScrollToBottom && (
          <button
            onClick={() => {
              scrollToBottom('smooth');
              setShowScrollToBottom(false);
            }}
            className="fixed bottom-32 right-4 z-40 px-3 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg shadow-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            回到最新
          </button>
        )}
      </div>
    </div>
  );
}




