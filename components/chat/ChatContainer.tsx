'use client';

import { useState, useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils/cn';
import { ChatActionProvider } from './ChatContext';
import { CrisisBanner } from './CrisisBanner';

export function ChatContainer() {
  const { messages, isLoading, error, sendMessage, clearHistory, sessionId } = useChat();
  const [draft, setDraft] = useState('');
  const [crisisDismissed, setCrisisDismissed] = useState(false);

  // 检测最近消息是否有危机状态
  const showCrisisBanner = useMemo(() => {
    if (crisisDismissed) return false;
    // 检查最近 3 条消息
    const recent = messages.slice(-3);
    return recent.some(m =>
      m.metadata?.safety?.label === 'crisis' ||
      m.metadata?.routeType === 'crisis'
    );
  }, [messages, crisisDismissed]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || isLoading) return;

    await sendMessage(content);
    setDraft(''); // 发送成功后清空
  };

  return (
    <ChatActionProvider value={{ sendMessage, isLoading }}>
      <div className="flex flex-col h-screen bg-gray-100">
        {/* 头部 */}
        <header className="bg-white border-b border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">心灵树洞</h1>
            <p className="text-sm text-gray-700 font-medium">随时陪你聊聊</p>
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

        {/* 危机资源横幅 */}
        <CrisisBanner
          isVisible={showCrisisBanner}
          onDismiss={() => setCrisisDismissed(true)}
        />

        {/* 错误提示 */}
        {error && (
          <div role="alert" className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 mx-4 mt-4 rounded">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* 消息列表 */}
        <MessageList messages={messages} isLoading={isLoading} sessionId={sessionId} />

        {/* 输入框 */}
        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          isLoading={isLoading}
        />
      </div>
    </ChatActionProvider>
  );
}




