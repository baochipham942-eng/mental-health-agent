'use client';

import { Emotion } from '@/types/chat';
import { EMOTION_COLORS, EMOTION_PROGRESS_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils/cn';

interface EmotionIndicatorProps {
  emotion?: Emotion;
  className?: string;
}

export function EmotionIndicator({ emotion, className }: EmotionIndicatorProps) {
  if (!emotion) return null;

  const { label, score } = emotion;
  const colorClass = EMOTION_COLORS[label] || EMOTION_COLORS['平静'];
  const progressColor = EMOTION_PROGRESS_COLORS[label] || EMOTION_PROGRESS_COLORS['平静'];
  const percentage = (score / 10) * 100;

  return (
    <div className={cn('flex items-center gap-2.5 text-sm', className)}>
      <span className={cn('px-3 py-1.5 rounded-md border-2 text-xs font-semibold shadow-sm', colorClass)}>
        {label}
      </span>
      <div className="flex-1 max-w-[120px]">
        <div className="h-2.5 bg-gray-300 rounded-full overflow-hidden shadow-inner">
          <div
            className={cn('h-full transition-all duration-300 rounded-full', progressColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <span className="text-xs font-semibold text-gray-700 min-w-[35px]">{score}/10</span>
    </div>
  );
}




