import type { StateCreator } from 'zustand';
import type { ChatState, RouteType, AssessmentStage } from '@/types/chat';
import type { ChatStore } from '../chatStore';

// === 评估状态 ===

export interface AssessmentSlice {
  // 当前对话状态
  currentState: ChatState | undefined;
  routeType: RouteType | undefined;
  assessmentStage: AssessmentStage | undefined;

  // 初始消息（用于多轮对话推进）
  initialMessage: string | undefined;

  // Actions
  updateState: (state: {
    currentState?: ChatState;
    routeType?: RouteType;
    assessmentStage?: AssessmentStage;
    initialMessage?: string;
  }) => void;
}

export const createAssessmentSlice: StateCreator<ChatStore, [], [], AssessmentSlice> = (set) => ({
  currentState: undefined,
  routeType: undefined,
  assessmentStage: undefined,
  initialMessage: undefined,

  updateState: (updates: {
    currentState?: ChatState;
    routeType?: RouteType;
    assessmentStage?: AssessmentStage;
    initialMessage?: string;
  }) =>
    set((state: ChatStore) => ({
      ...state,
      ...updates,
    })),
});
