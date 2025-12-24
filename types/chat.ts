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
  widget?: 'breathing' | 'meditation' | 'mood_tracker';
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
  // Simplified debug/meta
  debugPrompts?: {
    systemPrompt: string;
    userPrompt: string;
    messages: Array<{ role: string; content: string }>;
  };
}
