'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

interface NextStepsChecklistProps {
  items: string[];
  messageId: string;
}

export function NextStepsChecklist({ items, messageId }: NextStepsChecklistProps) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [lastCheckedText, setLastCheckedText] = useState<string | null>(null);

  useEffect(() => {
    // 从 localStorage 加载已完成的项
    const completedKey = `nextStepsCompleted_${messageId}`;
    const saved = localStorage.getItem(completedKey);
    if (saved) {
      try {
        const completedIndices = JSON.parse(saved) as number[];
        setCompleted(new Set(completedIndices));
      } catch (e) {
        console.error('Failed to load completed items:', e);
      }
    }

    // 从 localStorage 加载 pinned 项
    const pinnedKey = `nextStepsPinned_${messageId}`;
    const savedPinned = localStorage.getItem(pinnedKey);
    if (savedPinned) {
      try {
        const pinned = JSON.parse(savedPinned) as number | null;
        if (pinned !== null && pinned >= 0 && pinned < items.length) {
          setPinnedIndex(pinned);
        }
      } catch (e) {
        console.error('Failed to load pinned item:', e);
      }
    }
  }, [messageId, items.length]);

  const toggleCompleted = (index: number) => {
    const newCompleted = new Set(completed);
    const wasCompleted = newCompleted.has(index);

    if (wasCompleted) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
      // 显示勾选提示
      setLastCheckedText(items[index]);
      setTimeout(() => setLastCheckedText(null), 2000);
    }

    setCompleted(newCompleted);

    // 保存到 localStorage
    const key = `nextStepsCompleted_${messageId}`;
    localStorage.setItem(key, JSON.stringify(Array.from(newCompleted)));
  };

  const togglePinned = (index: number) => {
    const newPinned = pinnedIndex === index ? null : index;
    setPinnedIndex(newPinned);

    // 保存到 localStorage
    const key = `nextStepsPinned_${messageId}`;
    localStorage.setItem(key, JSON.stringify(newPinned));
  };

  if (items.length === 0) {
    return null;
  }

  const completedCount = completed.size;
  const totalCount = items.length;

  // 排序：pinned 的项在前面
  const sortedIndices = items
    .map((_, index) => index)
    .sort((a, b) => {
      if (a === pinnedIndex) return -1;
      if (b === pinnedIndex) return 1;
      return a - b;
    });

  return (
    <div className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">下一步行动清单</h3>
        <span className="text-sm text-gray-600 font-medium">
          已完成 {completedCount}/{totalCount}
        </span>
      </div>

      {/* 勾选提示 */}
      {lastCheckedText && (
        <div className="mb-3 p-2 bg-green-100 border border-green-300 rounded-lg text-sm text-green-800">
          ✓ 已标记完成：{lastCheckedText}
        </div>
      )}

      <ul className="space-y-2">
        {sortedIndices.map((index) => {
          const item = items[index];
          const isCompleted = completed.has(index);
          const isPinned = pinnedIndex === index;

          return (
            <li
              key={index}
              className={cn(
                'flex items-start gap-2 p-2 rounded-lg transition-colors',
                isPinned && 'bg-blue-100 border-2 border-blue-400'
              )}
            >
              <input
                type="checkbox"
                id={`next-step-${messageId}-${index}`}
                checked={isCompleted}
                onChange={() => toggleCompleted(index)}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor={`next-step-${messageId}-${index}`}
                className={cn(
                  'flex-1 text-sm',
                  isCompleted
                    ? 'line-through text-gray-500'
                    : 'text-gray-700',
                  isPinned && 'font-medium'
                )}
              >
                {item}
              </label>
              <button
                onClick={() => togglePinned(index)}
                className={cn(
                  'px-2 py-1 text-xs rounded-lg transition-colors',
                  isPinned
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                )}
                title={isPinned ? '取消置顶' : '今天只做这一条'}
              >
                📌
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
