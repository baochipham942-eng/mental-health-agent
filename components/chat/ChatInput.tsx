'use client';

import { useState, FormEvent, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isLoading, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading && !disabled) {
      onSend(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t bg-white p-4">
      <div className="flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题或感受..."
          disabled={isLoading || disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2',
            'text-gray-900 placeholder:text-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
            'disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed',
            'max-h-32 overflow-y-auto transition-colors duration-200'
          )}
          style={{
            minHeight: '44px',
            height: 'auto',
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading || disabled}
          className={cn(
            'px-6 py-2 rounded-lg font-medium transition-colors',
            'bg-blue-500 text-white hover:bg-blue-600',
            'disabled:bg-gray-300 disabled:cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          )}
        >
          {isLoading ? '发送中...' : '发送'}
        </button>
      </div>
      <p className="text-xs text-gray-600 mt-2 font-medium">
        按 Enter 发送，Shift + Enter 换行
      </p>
    </form>
  );
}




