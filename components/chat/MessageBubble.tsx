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
          'max-w-[80%] rounded-lg px-4 py-3 shadow-sm',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-900 border border-gray-200'
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
      </div>
      
      {!isUser && message.emotion && (
        <div className="px-2">
          <EmotionIndicator emotion={message.emotion} />
        </div>
      )}
      
      <span className={cn(
        'text-xs px-2 font-medium',
        isUser ? 'text-gray-500' : 'text-gray-600'
      )}>
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}



