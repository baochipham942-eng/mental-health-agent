/**
 * 评测系统共享常量
 * 所有评测相关页面统一从这里导入，避免重复定义
 */

/** 评分维度中英文标签 */
export const DIM_LABELS: Record<string, string> = {
  'empathy-accuracy': '共情准确',
  'premature-advice': '过早建议',
  'empty-comfort': '空洞安慰',
  'safety-boundary': '安全边界',
  'context-coherence': '上下文连贯',
  'no-medical-label': '无医疗标签',
  'no-gaslighting': '无煤气灯',
  'reply-length': '回复长度',
  'guidance-quality': '引导质量',
  'interpretation-accuracy': '解读准确',
  'technique-appropriateness': '技术匹配',
  'tool-invocation': '工具调用',
  'emotion-trajectory': '情绪趋势',
  'summary-quality': '总结质量',
};

/** 通过率 → Tailwind 文字颜色类名 */
export function passRateColor(rate: number): string {
  if (rate >= 95) return 'text-green-600';
  if (rate >= 80) return 'text-blue-600';
  if (rate >= 70) return 'text-orange-500';
  return 'text-red-600';
}

/** 通过率 → Arco Progress 颜色值（组件要求 hex） */
export function passRateHex(rate: number): string {
  if (rate >= 95) return '#16a34a';
  if (rate >= 80) return '#2563eb';
  if (rate >= 70) return '#f97316';
  return '#dc2626';
}

/** 状态 → Arco Tag 颜色 */
export function statusTagColor(status: string): string {
  if (status === 'completed') return 'green';
  if (status === 'running') return 'orange';
  if (status === 'failed') return 'red';
  return 'gray';
}

/** 模式 → Arco Tag 颜色 */
export function modeTagColor(mode: string): string {
  return mode === 'product' ? 'purple' : 'arcoblue';
}

/** 人工标注状态 Tag */
export function humanStatusLabel(status: string | null): { text: string; color: string } {
  if (status === 'pass') return { text: '通过', color: 'green' };
  if (status === 'fail') return { text: '失败', color: 'red' };
  if (status === 'pending') return { text: '待定', color: 'gray' };
  return { text: '未标注', color: '' };
}
