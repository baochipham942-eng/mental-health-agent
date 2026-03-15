/**
 * 转化漏斗事件追踪
 *
 * 漏斗：l0_chat_start → l1_skill_recommended → l1_skill_clicked → l1_skill_completed → l2_lab_entered
 */

import { logInfo } from './logger';
import { recordMetric } from '@/lib/ai/progress/tracker';

export type FunnelEvent =
  | 'l0_chat_start'
  | 'l1_skill_recommended'
  | 'l1_skill_clicked'
  | 'l1_skill_completed'
  | 'l2_lab_entered';

/**
 * 记录漏斗事件 — 同时写 logInfo（实时可观测）+ ProgressMetric（持久化查询）
 */
export async function trackFunnel(
  event: FunnelEvent,
  params: {
    userId?: string;
    sessionId?: string;
    skillType?: string;
    score?: number;
  } = {},
): Promise<void> {
  const { userId, sessionId, skillType, score } = params;

  logInfo(`funnel:${event}`, {
    userId,
    sessionId,
    skillType,
    score,
  });

  if (userId) {
    await recordMetric(
      userId,
      `funnel_${event}`,
      score ?? 1,
      sessionId,
      skillType || undefined,
    ).catch((e) => console.error('[Funnel] Failed to record metric:', e));
  }
}
