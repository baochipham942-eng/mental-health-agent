'use client';

import { useState, useCallback, useEffect } from 'react';
import { Message, ChatRequest } from '@/types/chat';
import { generateId } from '@/lib/utils/format';
import { STORAGE_KEYS } from '@/lib/constants';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 从本地存储加载历史记录
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(parsed);
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
    }
  }, []);

  // 保存到本地存储
  const saveToLocalStorage = useCallback((msgs: Message[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(msgs));
    } catch (e) {
      console.error('Failed to save chat history:', e);
    }
  }, []);

  // 发送消息
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => {
      const updated = [...prev, userMessage];
      saveToLocalStorage(updated);
      return updated;
    });

    setIsLoading(true);
    setError(null);

    try {
      // 构建历史记录（仅包含最近10轮对话）
      const recentHistory = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const request: ChatRequest = {
        message: content.trim(),
        history: recentHistory,
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: data.reply,
        timestamp: data.timestamp,
        emotion: data.emotion,
      };

      setMessages(prev => {
        const updated = [...prev, assistantMessage];
        saveToLocalStorage(updated);
        return updated;
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '发送消息失败';
      setError(errorMessage);
      console.error('Send message error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, saveToLocalStorage]);

  // 清空历史
  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
    } catch (e) {
      console.error('Failed to clear chat history:', e);
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
  };
}

