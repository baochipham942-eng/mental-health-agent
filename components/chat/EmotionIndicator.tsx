'use client';

import { Emotion } from '@/types/chat';
import { EMOTION_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils/cn';

interface EmotionIndicatorProps {
  emotion?: Emotion;
  className?: string;
}

export function EmotionIndicator({ emotion, className }: EmotionIndicatorProps) {
  if (!emotion) return null;

  const { label, score } = emotion;
  const colorClass = EMOTION_COLORS[label] || EMOTION_COLORS['平静'];
  const percentage = (score / 10) * 100;

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className={cn('px-2 py-1 rounded border text-xs font-medium', colorClass)}>
        {label}
      </span>
      <div className="flex-1 max-w-[100px]">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', colorClass.split(' ')[0])}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-gray-500">{score}/10</span>
    </div>
  );
}

