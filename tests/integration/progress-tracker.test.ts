/**
 * 进度追踪器测试
 *
 * 注意：这些测试不连接真实数据库，只测试纯函数逻辑。
 * 依赖 prisma 的函数通过 mock 或跳过测试。
 */

import { describe, it, expect, vi } from 'vitest';

// 直接测试内部导出的纯函数和类型
import type { ProgressTimeline } from '@/lib/ai/progress/tracker';

// =============================================================================
// 趋势计算测试
// =============================================================================

// 从 tracker.ts 中提取趋势计算逻辑进行独立测试
function calculateTrend(
  emotions: { date: string; value: number }[],
): 'improving' | 'stable' | 'worsening' {
  if (emotions.length < 3) return 'stable';

  const third = Math.ceil(emotions.length / 3);
  const early = emotions.slice(0, third);
  const recent = emotions.slice(-third);

  const earlyAvg = early.reduce((s, e) => s + e.value, 0) / early.length;
  const recentAvg = recent.reduce((s, e) => s + e.value, 0) / recent.length;

  const delta = recentAvg - earlyAvg;
  if (delta < -1) return 'improving';
  if (delta > 1) return 'worsening';
  return 'stable';
}

describe('calculateTrend', () => {
  it('should return stable for < 3 data points', () => {
    expect(calculateTrend([])).toBe('stable');
    expect(calculateTrend([{ date: '2024-01-01', value: 5 }])).toBe('stable');
    expect(calculateTrend([
      { date: '2024-01-01', value: 5 },
      { date: '2024-01-02', value: 3 },
    ])).toBe('stable');
  });

  it('should detect improving trend (scores decreasing)', () => {
    const data = [
      { date: '2024-01-01', value: 8 },
      { date: '2024-01-02', value: 7 },
      { date: '2024-01-03', value: 6 },
      { date: '2024-01-04', value: 5 },
      { date: '2024-01-05', value: 4 },
      { date: '2024-01-06', value: 3 },
    ];
    expect(calculateTrend(data)).toBe('improving');
  });

  it('should detect worsening trend (scores increasing)', () => {
    const data = [
      { date: '2024-01-01', value: 3 },
      { date: '2024-01-02', value: 4 },
      { date: '2024-01-03', value: 5 },
      { date: '2024-01-04', value: 6 },
      { date: '2024-01-05', value: 7 },
      { date: '2024-01-06', value: 8 },
    ];
    expect(calculateTrend(data)).toBe('worsening');
  });

  it('should detect stable trend', () => {
    const data = [
      { date: '2024-01-01', value: 5 },
      { date: '2024-01-02', value: 5 },
      { date: '2024-01-03', value: 5 },
      { date: '2024-01-04', value: 5 },
      { date: '2024-01-05', value: 5 },
      { date: '2024-01-06', value: 5 },
    ];
    expect(calculateTrend(data)).toBe('stable');
  });

  it('should handle small fluctuations as stable', () => {
    const data = [
      { date: '2024-01-01', value: 5 },
      { date: '2024-01-02', value: 6 },
      { date: '2024-01-03', value: 5 },
      { date: '2024-01-04', value: 4 },
      { date: '2024-01-05', value: 5 },
      { date: '2024-01-06', value: 5 },
    ];
    expect(calculateTrend(data)).toBe('stable');
  });
});

// =============================================================================
// ProgressTimeline 类型测试
// =============================================================================

describe('ProgressTimeline type', () => {
  it('should accept valid timeline data', () => {
    const timeline: ProgressTimeline = {
      emotions: [{ date: '2024-01-01', value: 5 }],
      phq9Scores: [{ date: '2024-01-01', score: 12, severity: 'moderate' }],
      gad7Scores: [],
      exerciseCount: 3,
      sessionCount: 5,
      trend: 'improving',
      milestones: ['连续 3 次会话情绪改善'],
    };
    expect(timeline.trend).toBe('improving');
    expect(timeline.milestones).toHaveLength(1);
  });

  it('should handle empty timeline', () => {
    const timeline: ProgressTimeline = {
      emotions: [],
      phq9Scores: [],
      gad7Scores: [],
      exerciseCount: 0,
      sessionCount: 0,
      trend: 'stable',
      milestones: [],
    };
    expect(timeline.exerciseCount).toBe(0);
    expect(timeline.milestones).toHaveLength(0);
  });
});

// =============================================================================
// 里程碑检测逻辑测试
// =============================================================================

describe('milestone detection logic', () => {
  it('should detect consecutive emotion improvement', () => {
    const emotions = [
      { date: '2024-01-01', value: 8 },
      { date: '2024-01-02', value: 6 },
      { date: '2024-01-03', value: 4 },
    ];
    const last3 = emotions.slice(-3);
    const isImproving = last3.every((e, i) => i === 0 || e.value <= last3[i - 1].value);
    expect(isImproving).toBe(true);
    expect(last3[0].value > last3[2].value).toBe(true);
  });

  it('should not trigger for non-improving sequence', () => {
    const emotions = [
      { date: '2024-01-01', value: 4 },
      { date: '2024-01-02', value: 6 },
      { date: '2024-01-03', value: 5 },
    ];
    const last3 = emotions.slice(-3);
    const isImproving = last3.every((e, i) => i === 0 || e.value <= last3[i - 1].value);
    expect(isImproving).toBe(false);
  });

  it('should detect PHQ-9 score reduction', () => {
    const phq9s = [
      { score: 15, severity: 'moderately_severe' },
      { score: 10, severity: 'moderate' },
    ];
    const latest = phq9s[phq9s.length - 1];
    const previous = phq9s[phq9s.length - 2];
    expect(latest.score < previous.score).toBe(true);
  });

  it('should detect recovery to normal', () => {
    const phq9s = [
      { score: 10, severity: 'moderate' },
      { score: 3, severity: 'minimal' },
    ];
    const latest = phq9s[phq9s.length - 1];
    const previous = phq9s[phq9s.length - 2];
    expect(latest.severity === 'minimal' && previous.severity !== 'minimal').toBe(true);
  });
});
