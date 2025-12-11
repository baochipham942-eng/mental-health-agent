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

// 情绪颜色映射
export const EMOTION_COLORS: Record<string, string> = {
  '焦虑': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '抑郁': 'bg-blue-100 text-blue-800 border-blue-300',
  '愤怒': 'bg-red-100 text-red-800 border-red-300',
  '悲伤': 'bg-gray-100 text-gray-800 border-gray-300',
  '恐惧': 'bg-purple-100 text-purple-800 border-purple-300',
  '快乐': 'bg-green-100 text-green-800 border-green-300',
  '平静': 'bg-indigo-100 text-indigo-800 border-indigo-300',
};

// 本地存储键名
export const STORAGE_KEYS = {
  CHAT_HISTORY: 'chat_history',
} as const;

