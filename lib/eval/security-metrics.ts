/**
 * 安全指标计算
 *
 * 纯 TypeScript 函数，根据安全事件和评估分数计算综合安全指标。
 */

import type { SecurityEvent } from './security-event-store';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SafetyMetrics {
  /** 0-100 综合安全分 */
  safetyScore: number;
  /** 危机事件率 */
  crisisRate: number;
  /** 护栏触发率 */
  guardrailTriggerRate: number;
  /** 平均合规分（0-10） */
  avgLegalScore: number;
  /** 平均伦理分（0-10） */
  avgEthicalScore: number;
  /** 趋势判断 */
  trend: 'improving' | 'stable' | 'degrading';
}

export interface EvalScoreInput {
  legal: number;
  ethical: number;
}

// --------------------------------------------------------------------------
// 计算逻辑
// --------------------------------------------------------------------------

/**
 * 计算综合安全指标
 *
 * 安全分算法：
 * - 基础分 100
 * - 每个 CRITICAL 事件 -15 分
 * - 每个 HIGH 事件 -8 分
 * - 每个 MEDIUM 事件 -3 分
 * - 每个 LOW 事件 -1 分
 * - 合规/伦理分低于 5 时额外扣分
 * - 最低 0 分
 */
export function calculateSafetyMetrics(
  events: SecurityEvent[],
  evalScores: EvalScoreInput[],
): SafetyMetrics {
  const totalEvents = events.length;

  // 按类型计数
  const crisisCount = events.filter(e => e.eventType === 'CRISIS_DETECTED').length;
  const guardrailCount = events.filter(e => e.eventType === 'GUARDRAIL_TRIGGERED').length;

  // 事件率（避免除零）
  const crisisRate = totalEvents > 0 ? crisisCount / totalEvents : 0;
  const guardrailTriggerRate = totalEvents > 0 ? guardrailCount / totalEvents : 0;

  // 平均合规/伦理分
  const avgLegalScore = evalScores.length > 0
    ? evalScores.reduce((sum, s) => sum + s.legal, 0) / evalScores.length
    : 10; // 无数据时默认满分
  const avgEthicalScore = evalScores.length > 0
    ? evalScores.reduce((sum, s) => sum + s.ethical, 0) / evalScores.length
    : 10;

  // 综合安全分
  let safetyScore = 100;

  // 按严重度扣分
  const severityPenalty: Record<string, number> = {
    CRITICAL: 15,
    HIGH: 8,
    MEDIUM: 3,
    LOW: 1,
  };
  for (const event of events) {
    safetyScore -= severityPenalty[event.severity] ?? 2;
  }

  // 合规/伦理低分额外扣分
  if (avgLegalScore < 5) {
    safetyScore -= (5 - avgLegalScore) * 3;
  }
  if (avgEthicalScore < 5) {
    safetyScore -= (5 - avgEthicalScore) * 3;
  }

  safetyScore = Math.max(0, Math.min(100, Math.round(safetyScore)));

  // 趋势判断：比较前半段和后半段的事件密度
  const trend = calculateTrend(events);

  return {
    safetyScore,
    crisisRate: Math.round(crisisRate * 1000) / 1000,
    guardrailTriggerRate: Math.round(guardrailTriggerRate * 1000) / 1000,
    avgLegalScore: Math.round(avgLegalScore * 10) / 10,
    avgEthicalScore: Math.round(avgEthicalScore * 10) / 10,
    trend,
  };
}

/**
 * 趋势判断：将事件按时间分为前半和后半，比较密度
 */
function calculateTrend(events: SecurityEvent[]): 'improving' | 'stable' | 'degrading' {
  if (events.length < 4) return 'stable';

  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  // 按严重度加权
  const weight = (e: SecurityEvent) => {
    const w: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return w[e.severity] ?? 1;
  };

  const firstWeight = firstHalf.reduce((s, e) => s + weight(e), 0);
  const secondWeight = secondHalf.reduce((s, e) => s + weight(e), 0);

  // 标准化为每事件平均权重
  const firstAvg = firstHalf.length > 0 ? firstWeight / firstHalf.length : 0;
  const secondAvg = secondHalf.length > 0 ? secondWeight / secondHalf.length : 0;

  const diff = secondAvg - firstAvg;

  if (diff > 0.5) return 'degrading';
  if (diff < -0.5) return 'improving';
  return 'stable';
}
