'use client';

import { ActionCard } from '@/types/chat';
import { ActionCardItem } from './ActionCardItem';

interface ActionCardGridProps {
  cards: ActionCard[];
}

export function ActionCardGrid({ cards }: ActionCardGridProps) {
  if (!cards || cards.length === 0) {
    return null;
  }

  // 容错：少于 2 张时按实际渲染
  if (cards.length < 2 && process.env.NODE_ENV === 'development') {
    console.warn(`[ActionCardGrid] actionCards 数量不足（期望2张，实际${cards.length}张）`);
  }

  return (
    <div className="w-full min-w-0">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-5xl mx-auto">
        {cards.map((card, index) => (
          <ActionCardItem key={index} card={card} index={index} />
        ))}
      </div>
    </div>
  );
}
