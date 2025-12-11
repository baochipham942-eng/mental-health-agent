'use client';

import { Message } from '@/types/chat';
import { formatTime } from '@/lib/utils/format';
import { EmotionIndicator } from './EmotionIndicator';
import { cn } from '@/lib/utils/cn';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex flex-col gap-2 mb-4',
        isUser ? 'items-end' : 'items-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3',
          isUser
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-900'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      
      {!isUser && message.emotion && (
        <EmotionIndicator emotion={message.emotion} />
      )}
      
      <span className="text-xs text-gray-400 px-2">
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}

