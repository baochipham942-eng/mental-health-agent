'use client';

import { useChat } from '@/hooks/useChat';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils/cn';

export function ChatContainer() {
  const { messages, isLoading, error, sendMessage, clearHistory } = useChat();

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* 头部 */}
      <header className="bg-white border-b border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">心理疗愈助手</h1>
          <p className="text-sm text-gray-700 font-medium">基于认知行为疗法的AI心理咨询</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
          >
            清空对话
          </button>
        )}
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 mx-4 mt-4 rounded">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* 消息列表 */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* 输入框 */}
      <ChatInput onSend={sendMessage} isLoading={isLoading} />
    </div>
  );
}



