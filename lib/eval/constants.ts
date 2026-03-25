/**
 * 评测系统共享常量
 * 所有评测相关页面统一从这里导入，避免重复定义
 */

import { DIM_LABELS as _DIM_LABELS } from './config';

/** 评分维度中英文标签（从 JSON 配置派生） */
export const DIM_LABELS: Record<string, string> = _DIM_LABELS;

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

/**
 * 标准化 LLM Judge 结果值（向后兼容旧数据 'Fail' → 'Wrong'）
 * 代码检查维度保持 'pass'/'fail' 不变
 */
export function normalizeJudgeResult(result: string): 'Pass' | 'Wrong' | 'Drift' {
  if (result === 'Pass') return 'Pass';
  if (result === 'Drift') return 'Drift';
  return 'Wrong'; // 'Fail'(旧数据) 或其他值都映射为 'Wrong'
}

/** LLM Judge 三态结果 → Arco Tag 颜色 */
export function judgeResultColor(result: string): string {
  const normalized = normalizeJudgeResult(result);
  if (normalized === 'Pass') return 'green';
  if (normalized === 'Drift') return 'orangered';
  return 'red'; // Wrong
}
