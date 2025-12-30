'use client';

import { useChat as useAiChat } from 'ai/react';
import { Message } from '@/types/chat';
import { generateId } from '@/lib/utils/format';
import { STORAGE_KEYS } from '@/lib/constants';
import { useEffect, useMemo, useState } from 'react';

export function useChat() {
  const [sessionId] = useState(() => generateId());

  // 使用 Vercel AI SDK 的 useChat
  // onFinish 回调用于持久化存储或后续处理
  const {
    messages: aiMessages,
    isLoading,
    error,
    append,
    setMessages: setAiMessages,
    reload
  } = useAiChat({
    api: '/api/chat',
    onResponse: (response) => {
      if (!response.ok) {
        console.error('Chat API Error:', response.statusText);
      }
    },
    onFinish: (message) => {
      // 可以在这里处理完成后的逻辑
    },
    onError: (error) => {
      console.error('Chat Error:', error);
    },
  });

  // 从本地存储加载历史记录
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      if (saved) {
        const parsed: Message[] = JSON.parse(saved);
        // 将自定义 Message 格式转换为 AI SDK Message 格式
        // 注意：AI SDK 的 data 字段是 JSONValue[]，我们需要适配
        const mappedMessages = parsed.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: new Date(msg.timestamp),
          // 恢复 data 字段（如果有）- 这里简化处理，因为 data 主要是流式传输用的
          // 我们主要依赖 messages state 映射回 UI
        }));
        // setAiMessages(mappedMessages as any); 
        // 类型不完全匹配，暂不自动加载，或者需要转换层
        // 为了兼容现有逻辑，我们可能需要一个自定义的转换函数
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
    }
  }, [setAiMessages]);

  // 将 aiMessages 转换为我们的 Message 类型
  const messages: Message[] = useMemo(() => {
    return aiMessages.map(m => {
      // 解析 data 字段中的元数据
      // StreamData 通常是数组，包含多个 appended 的对象
      const dataItems = m.data as any[];
      let emotion = undefined;
      let resources = undefined;
      let metadata: Message['metadata'] = undefined;

      if (dataItems && Array.isArray(dataItems)) {
        // 查找包含 emotion 或 resources 的项
        // 通常最后一个包含最新状态
        // 我们遍历所有项合并信息
        dataItems.forEach(item => {
          if (item?.emotion) emotion = item.emotion;
          if (item?.resources) resources = item.resources;
          // 提取 safety, state, routeType, assessmentStage, actionCards, persona, memory, adaptiveMode
          if (item?.safety || item?.state || item?.routeType || item?.assessmentStage || item?.actionCards || item?.persona || item?.memory || item?.adaptiveMode) {
            metadata = {
              ...metadata,
              safety: item.safety || metadata?.safety,
              state: item.state || metadata?.state,
              routeType: item.routeType || metadata?.routeType,
              assessmentStage: item.assessmentStage || metadata?.assessmentStage,
              actionCards: item.actionCards || metadata?.actionCards,
              persona: item.persona || metadata?.persona,
              memory: item.memory || metadata?.memory,
              adaptiveMode: item.adaptiveMode || metadata?.adaptiveMode,
            };
          }
        });
      }

      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.createdAt?.toISOString() || new Date().toISOString(),
        emotion,
        resources,
        metadata,
      };
    });
  }, [aiMessages]);

  // 发送消息适配器
  const sendMessage = async (content: string) => {
    await append({
      role: 'user',
      content,
    });
  };

  // 清空历史
  const clearHistory = () => {
    setAiMessages([]);
    localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
  };

  // 监听 messages 变化并保存到 localStorage
  // 注意：保存我们自定义格式的 messages
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages));
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
