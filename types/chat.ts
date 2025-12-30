import { AnyResource } from '@/lib/rag/types';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  emotion?: Emotion;
  resources?: AnyResource[]; // RAG 推荐资源
  toolCalls?: ToolCall[];
  metadata?: {
    routeType?: RouteType;
    assessmentStage?: AssessmentStage;
    actionCards?: ActionCard[];
    assistantQuestions?: string[];
    validationError?: any;
    error?: boolean;
    errorCode?: string;
    isSystemError?: boolean;
    safety?: {
      reasoning: string;
      label: 'crisis' | 'urgent' | 'self-care' | 'normal';
      score: number;
    };
    state?: {
      reasoning: string;
      overallProgress: number;
    };
    adaptiveMode?: string;
    persona?: {
      mode: string;
      reasoning: string;
    };
    memory?: {
      check: string;
      retrieved?: string;
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Emotion {
  label: string;
  score: number; // 0-10
}

export type ChatState = 'normal' | 'awaiting_followup' | 'in_crisis';
export type AssessmentStage = 'intake' | 'conclusion'; // Removed gap_followup

/**
 * Session lifecycle status enum (simplified).
 * - 'active': An active consultation is in progress (sessionId exists, not completed).
 * - 'ended': The session has ended (timer expired, user ended, or historical read-only view).
 * 
 * Note: 'idle' (no session) and 'creating' (transient) are no longer formal states.
 * They are derived from: sessionId undefined = idle; session creation in progress = internal flag.
 */
export type SessionStatus = 'active' | 'ended';

export interface ChatRequest {
  message: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  state?: ChatState;
  assessmentStage?: AssessmentStage;
  meta?: {
    initialMessage?: string;
    // Removed legacy state objects
  };
  sessionId?: string; // Add sessionId
}

export type RouteType = 'crisis' | 'assessment' | 'support';

export interface ActionCard {
  title: string;
  steps: string[];
  when: string;
  effort: 'low' | 'medium' | 'high';
  widget?: 'breathing' | 'meditation' | 'mood_tracker' | 'empty_chair';
}

export interface ChatResponse {
  reply: string;
  emotion?: Emotion;
  timestamp: string;
  routeType: RouteType;
  state?: ChatState;
  assessmentStage?: AssessmentStage;
  assistantQuestions?: string[];
  actionCards?: ActionCard[];
  resources?: AnyResource[];
  toolCalls?: ToolCall[];
  gate?: {
    pass: boolean;
    fixed?: boolean;
    missing?: string[];
  };
  safety?: {
    reasoning: string;
    label: string;
    score: number;
  };
  // New COT fields
  persona?: {
    mode: string;
    reasoning: string;
  };
  memory?: {
    check: string;
    retrieved?: string;
  };
  adaptiveMode?: string;
  // Simplified debug/meta
  debugPrompts?: {
    systemPrompt: string;
    userPrompt: string;
    messages: Array<{ role: string; content: string }>;
  };
}
