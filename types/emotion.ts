export type EmotionLabel =
  | '焦虑'
  | '抑郁'
  | '愤怒'
  | '悲伤'
  | '恐惧'
  | '快乐'
  | '平静'
  | '未表达'
  | '压力'
  | '疲惫'
  | '情绪低落';

export interface EmotionAnalysis {
  label: EmotionLabel;
  score: number; // 0-10
  confidence?: number; // 0-1
}




