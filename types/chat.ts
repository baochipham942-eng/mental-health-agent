export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  emotion?: Emotion;
}

export interface Emotion {
  label: string;
  score: number; // 0-10
}

export type ChatState = 'normal' | 'awaiting_followup' | 'in_crisis';
export type AssessmentStage = 'intake' | 'gap_followup' | 'conclusion';

export interface PressureSocraticState {
  asked: boolean;        // 是否已经发起过苏格拉底追问
  situationDone: boolean;
  thoughtDone: boolean;
  lastAskedAt?: number;  // 可选：防抖/避免同一轮重复
  lastQuestionText?: string;  // 上一轮问的问题文本，用于防重复
}

/**
 * Followup 槽位状态（用于 awaiting_followup 阶段的槽位收集）
 */
export interface FollowupSlotState {
  riskLevel: 'none' | 'passive' | 'active' | 'plan' | 'unknown';
  impactScore?: number;  // 0-10
  asked: {
    risk: boolean;
    impact: boolean;
  };
  done: boolean;  // 由 riskLevel != unknown && impactScore 是有效数字判断
  lastFollowupSlot?: 'risk' | 'impact';  // 最近一次问的槽位
}

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
    pressureSocratic?: PressureSocraticState;
    followupSlot?: FollowupSlotState;  // 新增：followup 槽位状态
  };
}

export type RouteType = 'crisis' | 'assessment' | 'support';

export interface ActionCard {
  title: string;
  steps: string[];
  when: string;
  effort: 'low' | 'medium' | 'high';
  widget?: 'breathing' | 'mood_tracker'; // 新增：关联的互动组件类型
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
  gate?: {
    pass: boolean;
    fixed?: boolean;
    missing?: string[];
  };
  meta?: {
    pressureSocratic?: PressureSocraticState;
    followupSlot?: FollowupSlotState;  // 新增：followup 槽位状态
  };
  debugPrompts?: {
    systemPrompt: string;
    userPrompt: string;
    messages: Array<{ role: string; content: string }>;
    selectedSkillIds?: string[];
    selectionReason?: string;
    slotValues?: Record<string, any>;
    routeType?: RouteType;
    assessmentStage?: AssessmentStage;
    pressureSocratic?: PressureSocraticState;
    slots?: {
      situation: boolean;
      thought: boolean;
      onlyEmotion: boolean;
    };
    questionType?: 'socratic' | 'scale' | 'other';
  };
  perf?: {
    total: number;
    llm_main: number;
    parse: number;
    gate_text: number;
    gate_cards: number;
    sanitize: number;
    repair: number;
    repairTriggered: boolean;
  };
}




