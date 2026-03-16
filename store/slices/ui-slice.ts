import type { StateCreator } from 'zustand';
import type { ChatModelId, ChatStore } from '../chatStore';

// === Debug 相关类型（从 any 清理迁移） ===

export interface DebugPrompts {
  systemPrompt?: string;
  userPrompt?: string;
  fullMessages?: Array<{ role: string; content: string }>;
  [key: string]: unknown;
}

export interface ValidationErrorInfo {
  field?: string;
  message?: string;
  [key: string]: unknown;
}

export interface RequestPayload {
  message?: string;
  history?: Array<{ role: string; content: string }>;
  state?: string;
  assessmentStage?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

// === UI 状态 ===

export interface UISlice {
  // 全局 input 暂存（用于页面切换时保留输入框内容）
  inputDraft: string;

  // Debug 面板
  debugDrawerOpen: boolean;
  debugPrompts: DebugPrompts | null;
  validationError: ValidationErrorInfo | null;
  lastRequestPayload: RequestPayload | null;

  // 当前模型选择
  currentModel: ChatModelId;

  // Actions
  setInputDraft: (draft: string) => void;
  setDebugDrawerOpen: (open: boolean) => void;
  setDebugPrompts: (prompts: DebugPrompts | null) => void;
  setValidationError: (error: ValidationErrorInfo | null) => void;
  setLastRequestPayload: (payload: RequestPayload | null) => void;
  setCurrentModel: (model: ChatModelId) => void;
}

export const createUISlice: StateCreator<ChatStore, [], [], UISlice> = (set) => ({
  inputDraft: '',
  debugDrawerOpen: false,
  debugPrompts: null,
  validationError: null,
  lastRequestPayload: null,
  currentModel: 'deepseek' as ChatModelId,

  setInputDraft: (draft: string) =>
    set({ inputDraft: draft }),

  setDebugDrawerOpen: (open: boolean) =>
    set({ debugDrawerOpen: open }),

  setDebugPrompts: (prompts: DebugPrompts | null) =>
    set({ debugPrompts: prompts }),

  setValidationError: (error: ValidationErrorInfo | null) =>
    set({ validationError: error }),

  setLastRequestPayload: (payload: RequestPayload | null) =>
    set({ lastRequestPayload: payload }),

  setCurrentModel: (model: ChatModelId) =>
    set({ currentModel: model }),
});
