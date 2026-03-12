'use client';

import { ActionCard } from '@/types/chat';
import { ActionCardItem } from './ActionCardItem';
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';

interface ActionCardGridProps {
  cards: ActionCard[];
  messageId: string;
  sessionId: string;
}

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

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
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {cards.map((card, index) => (
          <motion.div key={index} variants={itemVariants}>
            <ActionCardItem
              card={card}
              index={index}
              messageId={messageId}
              sessionId={sessionId}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
