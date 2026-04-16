'use client';

import { useChat as useAiChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useState } from 'react';
import { Message } from '@/types/chat';
import { generateId } from '@/lib/utils/format';
import { STORAGE_KEYS } from '@/lib/constants';
import type { ChatUIMessage } from '@/types/chat-ui-message';

/**
 * v6 useChat 包装层 — 对外保持 { messages, isLoading, error, sendMessage, clearHistory, sessionId } 公共 API
 * 内部把 v6 ChatUIMessage[] 转成项目自定义的 Message[] 结构（含 13 个 metadata 字段）
 */
export function useChat() {
  const [sessionId] = useState(() => generateId());

  const {
    messages: aiMessages,
    sendMessage: aiSendMessage,
    setMessages: setAiMessages,
    status,
    error,
  } = useAiChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (err) => {
      console.error('Chat Error:', err);
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // v6 ChatUIMessage[] → 项目自定义 Message[]（提取 13 个 typed data parts）
  const messages: Message[] = useMemo(() => {
    return aiMessages.map((m) => {
      let textContent = '';
      let emotion: Message['emotion'] | undefined;
      let metadata: Message['metadata'] | undefined;

      for (const part of m.parts) {
        if (part.type === 'text') {
          textContent += part.text;
          continue;
        }
        if (part.type === 'data-emotion') {
          emotion = part.data;
          continue;
        }
        if (part.type === 'data-route') {
          metadata = { ...metadata, routeType: part.data.routeType };
          continue;
        }
        if (part.type === 'data-safety') {
          metadata = { ...metadata, safety: part.data as NonNullable<Message['metadata']>['safety'] };
          continue;
        }
        if (part.type === 'data-state') {
          // 老结构 state 是 {reasoning, overallProgress}；v6 part 只带 state 字符串和 reasoning，做最小映射
          metadata = {
            ...metadata,
            state: { reasoning: part.data.reasoning || part.data.state, overallProgress: 0 },
          };
          continue;
        }
        if (part.type === 'data-persona') {
          metadata = {
            ...metadata,
            persona: { mode: part.data.mode, reasoning: part.data.reasoning || '' },
          };
          continue;
        }
        if (part.type === 'data-memory') {
          metadata = {
            ...metadata,
            memory: { check: part.data.check || '无', retrieved: part.data.retrieved },
          };
          continue;
        }
        if (part.type === 'data-dialogue') {
          metadata = {
            ...metadata,
            dialogue: {
              turn: part.data.turn,
              phase: part.data.phase,
              riskLevel: part.data.riskLevel,
            },
          };
          continue;
        }
        if (part.type === 'data-adaptive-mode') {
          metadata = { ...metadata, adaptiveMode: part.data.mode };
          continue;
        }
        if (part.type === 'data-assessment-stage') {
          metadata = { ...metadata, assessmentStage: part.data.stage };
          continue;
        }
        if (part.type === 'data-action-cards') {
          metadata = { ...metadata, actionCards: part.data.cards as any };
          continue;
        }
        if (part.type === 'data-guard-input-blocked') {
          metadata = { ...metadata, guardBlocked: part.data.reason };
          continue;
        }
        // data-relevant-memories / data-guard-output-redacted / data-trace
        // 暂不映射到 Message.metadata，前端 UI 没消费（trace 由 dashboard 单独读）
      }

      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: textContent,
        timestamp: new Date().toISOString(),
        emotion,
        metadata,
      };
    });
  }, [aiMessages]);

  const sendMessage = async (content: string) => {
    await aiSendMessage({ text: content });
  };

  const clearHistory = () => {
    setAiMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
    } catch {}
  };

  // 持久化 messages 到 localStorage（与老版本行为一致，便于刷新后保留显示）
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages));
      } catch {}
    }
  }, [messages]);

  return {
    messages,
    isLoading,
    error: error?.message || null,
    sendMessage,
    clearHistory,
    sessionId,
  };
}
