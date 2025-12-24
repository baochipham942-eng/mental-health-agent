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

  // 全局 input 暂存（用于页面切换时保留输入框内容）
  inputDraft: string;

  // 临时过渡消息（sessionId -> Messages），用于解决新会话跳转时的状态丢失问题
  transitionMessages: Record<string, Message[]>;

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
  setInputDraft: (draft: string) => void;
  setDebugDrawerOpen: (open: boolean) => void;
  setDebugPrompts: (prompts: any | null) => void;
  setValidationError: (error: any | null) => void;
  setLastRequestPayload: (payload: any | null) => void;
  resetConversation: () => void;
  updateSkillProgress: (cardId: string, progress: SkillProgress) => void;
  getSkillProgress: (cardId: string) => SkillProgress | undefined;
  setMessages: (messages: Message[]) => void;
  setTransitionMessages: (sessionId: string, messages: Message[]) => void;
  getAndClearTransitionMessages: (sessionId: string) => Message[] | undefined;
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
      inputDraft: '',
      transitionMessages: {},
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

      setInputDraft: (draft: string) =>
        set({ inputDraft: draft }),

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

      setTransitionMessages: (sessionId: string, messages: Message[]) =>
        set((state: ChatStore) => ({
          transitionMessages: {
            ...state.transitionMessages,
            [sessionId]: messages,
          },
        })),

      getAndClearTransitionMessages: (sessionId: string) => {
        const state = get();
        const messages = state.transitionMessages[sessionId];
        if (messages) {
          // 如果取出，立即清理（阅后即焚），避免污染后续逻辑
          set((state: ChatStore) => {
            const newTransitionMessages = { ...state.transitionMessages };
            delete newTransitionMessages[sessionId];
            return { transitionMessages: newTransitionMessages };
          });
        }
        return messages;
      },

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
          // 注意：inputDraft 不重置，以允许"带着输入去新会话"
          error: null,
          debugDrawerOpen: false,
          debugPrompts: null,
          validationError: null,
          lastRequestPayload: null,
          // 注意：skillProgress 不重置，保持持久化
        });
        // 注意：不再清理 localStorage，因为 messages 不再持久化
      },
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => localStorage),
      // 仅持久化技能进度，不持久化消息（消息从服务端加载，避免会话污染）
      partialize: (state: ChatStore) => ({
        skillProgress: state.skillProgress,
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

// 需要导入 React
import * as React from 'react';
