import * as React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createChatSlice } from './slices/chat-slice';
import { createUISlice } from './slices/ui-slice';
import { createAssessmentSlice } from './slices/assessment-slice';

import type { ChatSlice } from './slices/chat-slice';
import type { UISlice } from './slices/ui-slice';
import type { AssessmentSlice } from './slices/assessment-slice';

// === 类型导出 ===

export interface SkillProgress {
  status: 'not_started' | 'in_progress' | 'done';
  completedSteps: number[];
}

// 可用模型列表
export type ChatModelId = 'deepseek' | 'kimi' | 'openrouter';

export const CHAT_MODELS: Record<ChatModelId, { label: string; modelName: string }> = {
  deepseek: { label: 'DeepSeek R3', modelName: 'deepseek-chat' },
  kimi: { label: 'Kimi K2.5', modelName: 'kimi-k2.5' },
  openrouter: { label: 'GPT 5.4', modelName: 'openai/gpt-5.4' },
};

// 组合类型：所有 slice 的联合
export type ChatStore = ChatSlice & UISlice & AssessmentSlice;

// === Store 创建 ===

export const useChatStore = create<ChatStore>()(
  persist(
    (...a) => ({
      ...createChatSlice(...a),
      ...createUISlice(...a),
      ...createAssessmentSlice(...a),
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => localStorage),
      // 持久化技能进度和模型选择
      partialize: (state: ChatStore) => ({
        skillProgress: state.skillProgress,
        currentModel: state.currentModel,
      }),
    }
  )
);

// 简单的水合状态检测 hook
export const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = React.useState(false);

  React.useEffect(() => {
    // 检查是否已经水合
    const checkHydration = () => {
      // persist.hasHydrated 是一个函数
      if (useChatStore.persist.hasHydrated()) {
        setHasHydrated(true);
      }
    };

    checkHydration();

    // 监听水合完成事件
    const unsubFinishHydration = useChatStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });

    return () => {
      unsubFinishHydration();
    };
  }, []);

  return hasHydrated;
};
