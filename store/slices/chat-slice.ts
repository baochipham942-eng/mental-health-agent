import type { StateCreator } from 'zustand';
import type { Message } from '@/types/chat';
import type { SkillProgress } from '../chatStore';
import type { ChatStore } from '../chatStore';

// === 核心聊天状态 ===

export interface ChatSlice {
  // 消息列表
  messages: Message[];

  // followupAnswer 累计（仅前端内部使用，不持久化）
  followupAnswerDraft: string;

  // 临时过渡消息（sessionId -> Messages），用于解决新会话跳转时的状态丢失问题
  transitionMessages: Record<string, Message[]>;

  // 技能进度（行动卡片完成态）
  skillProgress: Record<string, SkillProgress>;

  // 全局状态
  isLoading: boolean;
  error: string | null;

  // Session lifecycle
  sessionStatus: import('@/types/chat').SessionStatus | undefined;
  setSessionStatus: (status: import('@/types/chat').SessionStatus | undefined) => void;

  // Flag to track if we're in the middle of creating a session (survives remounts)
  isCreatingSession: boolean;
  setCreatingSession: (val: boolean) => void;

  // @deprecated Use sessionStatus === 'active' instead
  isConsulting: boolean;
  setConsulting: (val: boolean) => void;

  // 当前会话 ID（持久化跨组件状态）
  currentSessionId: string | undefined;
  setCurrentSessionId: (id: string | undefined) => void;

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  appendFollowupAnswer: (answer: string) => void;
  clearFollowupAnswer: () => void;
  setMessages: (messages: Message[]) => void;
  setTransitionMessages: (sessionId: string, messages: Message[]) => void;
  getAndClearTransitionMessages: (sessionId: string) => Message[] | undefined;
  updateSkillProgress: (cardId: string, progress: SkillProgress) => void;
  getSkillProgress: (cardId: string) => SkillProgress | undefined;
  resetConversation: () => void;
}

export const createChatSlice: StateCreator<ChatStore, [], [], ChatSlice> = (set, get) => ({
  messages: [],
  followupAnswerDraft: '',
  transitionMessages: {},
  skillProgress: {},
  isLoading: false,
  error: null,
  sessionStatus: undefined,
  setSessionStatus: (status) => set({ sessionStatus: status }),
  isCreatingSession: false,
  setCreatingSession: (val) => set({ isCreatingSession: val }),
  isConsulting: false,
  setConsulting: (val) => set({ isConsulting: val }),
  currentSessionId: undefined,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),

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
      sessionStatus: undefined,
      isConsulting: false, // Keep in sync for backward compat
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
});
