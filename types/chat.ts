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

export type ChatState = 'normal' | 'awaiting_followup';
export type AssessmentStage = 'intake' | 'gap_followup' | 'conclusion';

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
}

export type RouteType = 'crisis' | 'assessment' | 'support';

export interface ActionCard {
  title: string;
  steps: string[];
  when: string;
  effort: 'low' | 'medium' | 'high';
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
  debugPrompts?: {
    systemPrompt: string;
    userPrompt: string;
    messages: Array<{ role: string; content: string }>;
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




