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

export interface ChatRequest {
  message: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface ChatResponse {
  reply: string;
  emotion?: Emotion;
  timestamp: string;
}

