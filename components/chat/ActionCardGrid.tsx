'use client';

import { ActionCard } from '@/types/chat';
import { ActionCardItem } from './ActionCardItem';
import { useRef, useEffect } from 'react';

interface ActionCardGridProps {
  cards: ActionCard[];
  messageId: string;
  sessionId: string;
}

export function ActionCardGrid({ cards, messageId, sessionId }: ActionCardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // 卡片首次出现时自动滚动到屏幕中央
  useEffect(() => {
    if (gridRef.current && cards.length > 0) {
      setTimeout(() => {
        gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, []); // 只在首次渲染时触发

  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <div ref={gridRef} className="w-full min-w-0">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        {cards.map((card, index) => (
          <ActionCardItem
            key={index}
            card={card}
            index={index}
            messageId={messageId}
            sessionId={sessionId}
          />
        ))}
      </div>
    </div>
  );
}

