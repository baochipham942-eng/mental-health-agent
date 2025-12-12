// 情绪标签配置
export const EMOTION_LABELS = [
  '焦虑',
  '抑郁',
  '愤怒',
  '悲伤',
  '恐惧',
  '快乐',
  '平静',
] as const;

// 情绪颜色映射 - 增强对比度，提高可读性
export const EMOTION_COLORS: Record<string, string> = {
  '焦虑': 'bg-yellow-200 text-yellow-900 border-yellow-400 font-semibold',
  '抑郁': 'bg-blue-200 text-blue-900 border-blue-400 font-semibold',
  '愤怒': 'bg-red-200 text-red-900 border-red-400 font-semibold',
  '悲伤': 'bg-gray-200 text-gray-900 border-gray-400 font-semibold',
  '恐惧': 'bg-purple-200 text-purple-900 border-purple-400 font-semibold',
  '快乐': 'bg-green-200 text-green-900 border-green-400 font-semibold',
  '平静': 'bg-indigo-200 text-indigo-900 border-indigo-400 font-semibold',
};

// 情绪进度条颜色映射
export const EMOTION_PROGRESS_COLORS: Record<string, string> = {
  '焦虑': 'bg-yellow-500',
  '抑郁': 'bg-blue-500',
  '愤怒': 'bg-red-500',
  '悲伤': 'bg-gray-500',
  '恐惧': 'bg-purple-500',
  '快乐': 'bg-green-500',
  '平静': 'bg-indigo-500',
};

// 本地存储键名
export const STORAGE_KEYS = {
  CHAT_HISTORY: 'chat_history',
} as const;



