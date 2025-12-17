import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Message, RouteType, AssessmentStage, ChatState, ActionCard } from '@/types/chat';

export interface SkillProgress {
  status: 'not_started' | 'in_progress' | 'done';
  completedSteps: number[];
}

interface ChatStore {
  // 消息列表
  messages: Message[];

  // 当前对话状态
  currentState: ChatState | undefined;
  routeType: RouteType | undefined;
  assessmentStage: AssessmentStage | undefined;

  // 初始消息（用于多轮对话推进）
  initialMessage: string | undefined;

  // followupAnswer 累计（仅前端内部使用，不持久化）
  followupAnswerDraft: string;

  // 技能进度（行动卡片完成态）
  skillProgress: Record<string, SkillProgress>;

  // UI 状态
  isLoading: boolean;
  error: string | null;

  // Debug 面板
  debugDrawerOpen: boolean;
  debugPrompts: any | null;
  validationError: any | null;
  lastRequestPayload: any | null;

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void; // New action
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateState: (state: {
    currentState?: ChatState;
    routeType?: RouteType;
    assessmentStage?: AssessmentStage;
    initialMessage?: string;
  }) => void;
  clearMessages: () => void;
  appendFollowupAnswer: (answer: string) => void;
  clearFollowupAnswer: () => void;
  setDebugDrawerOpen: (open: boolean) => void;
  setDebugPrompts: (prompts: any | null) => void;
  setValidationError: (error: any | null) => void;
  setLastRequestPayload: (payload: any | null) => void;
  resetConversation: () => void;
  updateSkillProgress: (cardId: string, progress: SkillProgress) => void;
  getSkillProgress: (cardId: string) => SkillProgress | undefined;
  setMessages: (messages: Message[]) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set: (partial: Partial<ChatStore> | ((state: ChatStore) => Partial<ChatStore>)) => void, get: () => ChatStore) => ({
      messages: [],
      currentState: undefined,
      routeType: undefined,
      assessmentStage: undefined,
      initialMessage: undefined,
      followupAnswerDraft: '',
      skillProgress: {},
      isLoading: false,
      error: null,
      debugDrawerOpen: false,
      debugPrompts: null,
      validationError: null,
      lastRequestPayload: null,

      addMessage: (message: Message) =>
        set((state: ChatStore) => ({
          messages: [...state.messages, message],
        })),

      updateMessage: (id: string, updates: Partial<Message>) =>
        set((state: ChatStore) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        })),

      setLoading: (loading: boolean) =>
        set({ isLoading: loading }),

      setError: (error: string | null) =>
        set({ error }),

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

      clearMessages: () =>
        set({
          messages: [],
          currentState: undefined,
          routeType: undefined,
          assessmentStage: undefined,
          initialMessage: undefined,
          followupAnswerDraft: '',
          error: null,
          debugPrompts: null,
          validationError: null,
        }),

      appendFollowupAnswer: (answer: string) =>
        set((state: ChatStore) => ({
          followupAnswerDraft: state.followupAnswerDraft
            ? `${state.followupAnswerDraft}\n${answer}`
            : answer,
        })),

      clearFollowupAnswer: () =>
        set({ followupAnswerDraft: '' }),

      setDebugDrawerOpen: (open: boolean) =>
        set({ debugDrawerOpen: open }),

      setDebugPrompts: (prompts: any | null) =>
        set({ debugPrompts: prompts }),

      setValidationError: (error: any | null) =>
        set({ validationError: error }),

      setLastRequestPayload: (payload: any | null) =>
        set({ lastRequestPayload: payload }),

      setMessages: (messages: Message[]) =>
        set({ messages }),

      updateSkillProgress: (cardId: string, progress: SkillProgress) =>
        set((state: ChatStore) => ({
          skillProgress: {
            ...state.skillProgress,
            [cardId]: progress,
          },
        })),

      getSkillProgress: (cardId: string) => {
        const state = get();
        return state.skillProgress[cardId];
      },

      resetConversation: () => {
        // 重置所有状态
        set({
          messages: [],
          currentState: undefined,
          routeType: undefined,
          assessmentStage: undefined,
          initialMessage: undefined,
          followupAnswerDraft: '',
          isLoading: false,
          error: null,
          debugDrawerOpen: false,
          debugPrompts: null,
          validationError: null,
          lastRequestPayload: null,
          // 注意：skillProgress 不重置，保持持久化
        });

        // 清理 zustand persist 存储
        if (typeof window !== 'undefined') {
          localStorage.removeItem('chat-storage');

          // 清理 NextStepsChecklist 的 localStorage keys
          // 查找所有 nextStepsCompleted_ 和 nextStepsPinned_ 开头的 key
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('nextStepsCompleted_') || key.startsWith('nextStepsPinned_'))) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
        }
      },
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state: ChatStore) => ({
        messages: state.messages,
        initialMessage: state.initialMessage,
        currentState: state.currentState,
        routeType: state.routeType,
        assessmentStage: state.assessmentStage,
        skillProgress: state.skillProgress, // 持久化技能进度
      }),
    }
  )
);
