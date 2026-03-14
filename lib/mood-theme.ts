/**
 * 情绪主题系统
 * 将后端 7 种情绪映射到 5 种视觉主题，通过 CSS 变量驱动全局色彩
 */

export interface MoodTheme {
  key: string;
  color: string;        // RGB 值，用于 CSS 变量 rgba(var(--mood-color), ...)
  label: string;        // 状态文案
  energy: number;       // 能量条百分比 0-100
  bgPage: string;       // 页面背景渐变
}

export const MOOD_THEMES: Record<string, MoodTheme> = {
  default: {
    key: 'default',
    color: '99, 102, 241',
    label: '还不错',
    energy: 50,
    bgPage: 'linear-gradient(135deg, #f0f1f8 0%, #eef0fa 100%)',
  },
  rain: {
    key: 'rain',
    color: '100, 116, 180',
    label: '有些沉重',
    energy: 35,
    bgPage: 'linear-gradient(135deg, #eef0f8 0%, #e8e6f0 100%)',
  },
  spring: {
    key: 'spring',
    color: '234, 150, 140',
    label: '期待中',
    energy: 65,
    bgPage: 'linear-gradient(135deg, #fef7f0 0%, #fdf0ee 100%)',
  },
  ocean: {
    key: 'ocean',
    color: '60, 130, 190',
    label: '有些翻涌',
    energy: 40,
    bgPage: 'linear-gradient(135deg, #f0f5fa 0%, #e8f0f8 100%)',
  },
  autumn: {
    key: 'autumn',
    color: '200, 140, 80',
    label: '想要放下',
    energy: 45,
    bgPage: 'linear-gradient(135deg, #fdf6ee 0%, #f8f0e5 100%)',
  },
};

/**
 * 将后端情绪标签映射到视觉主题
 */
export function emotionToMoodTheme(emotionLabel?: string, score?: number): MoodTheme {
  if (!emotionLabel || emotionLabel === '未表达') return MOOD_THEMES.default;

  const mapping: Record<string, string> = {
    '焦虑': 'ocean',
    '抑郁': 'rain',
    '愤怒': 'autumn',
    '悲伤': 'rain',
    '恐惧': 'ocean',
    '快乐': 'spring',
    '平静': 'default',
  };

  const themeKey = mapping[emotionLabel] || 'default';
  const theme = MOOD_THEMES[themeKey];

  // 根据强度微调能量值
  if (score !== undefined) {
    return {
      ...theme,
      energy: Math.max(10, Math.min(90, score * 10)),
    };
  }

  return theme;
}

/**
 * 获取情绪变化的描述文案
 */
export function getMoodShiftText(from: MoodTheme, to: MoodTheme): string {
  return `${from.label} → ${to.label}`;
}

/**
 * 将主题色应用到 DOM
 */
export function applyMoodColor(color: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--mood-color', color);
  }
}
