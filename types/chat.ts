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
      constraints?: string[];
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
    dialogue?: {
      turn: number;
      phase: string;
      riskLevel: string;
    };
    guardBlocked?: string;
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
  };
  sessionId?: string;
  model?: string; // 用户选择的模型名称，如 gpt-4o, kimi-k2.5
  provider?: string; // 显式指定 provider: deepseek | openai | kimi | openrouter | glm
}

export type RouteType = 'crisis' | 'assessment' | 'support';

export interface ActionCard {
  title: string;
  steps: string[];
  when: string;
  effort: 'low' | 'medium' | 'high';
  widget?: 'breathing' | 'meditation' | 'mood_tracker' | 'empty_chair' | 'grounding' | 'reframing' | 'activation' | 'leaves_stream';
  /** 是否为 AI 引导型练习（grounding/reframing/activation/empty_chair） */
  guided?: boolean;
  /** 引导练习总步数 */
  totalSteps?: number;
}

// 群组对话（圆桌论道）消息
export interface GroupMessage {
  id: string;
  role: 'user' | 'assistant' | 'moderator' | 'synthesis';
  content: string;
  mentorId?: string;
  mentorName?: string;
  mentorAvatar?: string;
  mentorColor?: string;
  round?: number;
  timestamp: string;
  // Moderator 专用
  moderatorAction?: 'opening' | 'point' | 'transition' | 'synthesize';
  targetMentorId?: string;
}

// 群组对话 SSE 事件类型
export type GroupSSEEvent =
  | { type: 'mentor_start'; mentorId: string; mentorName: string; mentorAvatar: string; mentorColor: string; round: number }
  | { type: 'mentor_chunk'; content: string }
  | { type: 'mentor_end'; mentorId: string }
  | { type: 'moderator'; content: string; action: 'opening' | 'point' | 'transition' | 'synthesize'; targetMentorId?: string }
  | { type: 'synthesis'; content: string }
  | { type: 'round_end'; round: number }
  | { type: 'done' }
  | { type: 'error'; message: string };

// Agent Trace — 用于评测系统可视化各阶段耗时
export interface AgentTraceStep {
  agent: 'triage' | 'safety' | 'counselor' | 'quality' | 'prefetch';
  startMs: number;    // 相对于请求开始的毫秒
  durationMs: number;
  model?: string;     // 使用的模型
  skipped?: boolean;  // 如 safety 未触发
  result?: string;    // 简要结果（如 triage 的 routeType）
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
