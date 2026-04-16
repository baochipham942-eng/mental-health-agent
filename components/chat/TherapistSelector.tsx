'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TherapistOption {
  id: string;
  name: string;
  avatar: string;
  style: string;
  description: string;
  approach: string;
}

const THERAPISTS: TherapistOption[] = [
  {
    id: 'xiaowarm',
    name: '小温',
    avatar: '🌸',
    style: '温暖型',
    description: '温暖包容的倾听者，擅长情感陪伴',
    approach: '人本主义 + 情绪聚焦',
  },
  {
    id: 'mingyuan',
    name: '明远',
    avatar: '🔭',
    style: '理性型',
    description: '理性清晰的引导者，擅长思路梳理',
    approach: 'CBT + 问题解决',
  },
  {
    id: 'qinghe',
    name: '清和',
    avatar: '🍃',
    style: '正念型',
    description: '平和宁静的觉察者，擅长正念引导',
    approach: '正念 + ACT',
  },
];

interface TherapistSelectorProps {
  onSelect: (therapistId: string) => void;
  onSkip: () => void;
}

export function TherapistSelector({ onSelect, onSkip }: TherapistSelectorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelect = async (id: string) => {
    setSelected(id);
    setIsSubmitting(true);

    try {
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredTherapist: id }),
      });
      onSelect(id);
    } catch (e) {
      console.error('[TherapistSelector] Failed to save:', e);
      onSelect(id); // Still proceed even if save fails
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRandom = () => {
    const randomIdx = Math.floor(Math.random() * THERAPISTS.length);
    handleSelect(THERAPISTS[randomIdx].id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mx-auto max-w-lg px-4 py-6"
    >
      <div className="mb-4 text-center">
        <h3 className="text-lg font-medium text-gray-800">
          选一个你喜欢的聊天风格
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          每种风格都不一样，选一个你感觉最舒服的
        </p>
      </div>

      <div className="space-y-3">
        {THERAPISTS.map((t) => (
          <motion.button
            key={t.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect(t.id)}
            disabled={isSubmitting}
            className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
              selected === t.id
                ? 'border-blue-400 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-xs'
            } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">{t.avatar}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{t.name}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {t.style}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                <p className="mt-0.5 text-xs text-gray-400">{t.approach}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={handleRandom}
          disabled={isSubmitting}
          className="rounded-lg px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          随机选择
        </button>
        <button
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          跳过
        </button>
      </div>
    </motion.div>
  );
}
