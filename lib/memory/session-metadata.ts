/**
 * Session Metadata 追踪
 * 借鉴 ChatGPT 的使用行为模式追踪，为心理陪伴场景提供行为信号
 *
 * 追踪指标：
 * - sessionCount: 累计会话数
 * - lastSessionAt: 上次会话时间
 * - avgSessionHour: 平均使用时段（加权移动平均）
 * - activeStreak: 连续活跃天数
 * - gapDays: 距上次会话间隔天数
 */

import { getUserSessionFields, updateUserSession } from './data-bridge';
import { logInfo } from '@/lib/observability/logger';

export interface SessionMetadata {
  sessionCount: number;
  lastSessionAt: Date | null;
  avgSessionHour: number | null;
  activeStreak: number;
  gapDays: number;
}

/**
 * 会话开始时更新 Session Metadata
 * 设计为幂等：同一天多次调用只增加 sessionCount，不重复计算 streak
 */
export async function updateSessionMetadata(userId: string): Promise<SessionMetadata> {
  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const user = await getUserSessionFields(userId);

  if (!user) return { sessionCount: 0, lastSessionAt: null, avgSessionHour: null, activeStreak: 0, gapDays: 0 };

  const lastDateStr = user.lastActiveDateStr;
  const isNewDay = lastDateStr !== todayStr;

  // 计算间隔天数
  let gapDays = 0;
  if (lastDateStr) {
    const lastDate = new Date(lastDateStr + 'T00:00:00');
    const todayDate = new Date(todayStr + 'T00:00:00');
    gapDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 计算 streak
  let newStreak = user.activeStreak;
  if (isNewDay) {
    if (gapDays === 1) {
      // 连续活跃
      newStreak = user.activeStreak + 1;
    } else if (gapDays === 0) {
      // 同一天，不变
    } else {
      // 断了，重置为 1
      newStreak = 1;
    }
  }

  // 加权移动平均计算使用时段（α=0.3，新值权重更高）
  const alpha = 0.3;
  const newAvgHour = user.avgSessionHour != null
    ? user.avgSessionHour * (1 - alpha) + currentHour * alpha
    : currentHour;

  const updated = await updateUserSession(userId, {
    sessionCount: { increment: 1 },
    lastSessionAt: now,
    avgSessionHour: Math.round(newAvgHour * 10) / 10,
    activeStreak: newStreak,
    lastActiveDateStr: todayStr,
  });

  logInfo('session-metadata-updated', {
    userId,
    sessionCount: updated.sessionCount,
    avgSessionHour: updated.avgSessionHour,
    activeStreak: updated.activeStreak,
    gapDays,
    isNewDay,
  });

  return {
    sessionCount: updated.sessionCount,
    lastSessionAt: updated.lastSessionAt,
    avgSessionHour: updated.avgSessionHour,
    activeStreak: updated.activeStreak,
    gapDays,
  };
}

/**
 * 读取 Session Metadata（不更新）
 */
export async function getSessionMetadata(userId: string): Promise<SessionMetadata> {
  const user = await getUserSessionFields(userId);

  if (!user) return { sessionCount: 0, lastSessionAt: null, avgSessionHour: null, activeStreak: 0, gapDays: 0 };

  let gapDays = 0;
  if (user.lastActiveDateStr) {
    const lastDate = new Date(user.lastActiveDateStr + 'T00:00:00');
    const todayDate = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
    gapDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    sessionCount: user.sessionCount,
    lastSessionAt: user.lastSessionAt,
    avgSessionHour: user.avgSessionHour,
    activeStreak: user.activeStreak,
    gapDays,
  };
}

/**
 * 将 Session Metadata 格式化为系统提示词注入文本
 */
export function formatSessionMetadata(meta: SessionMetadata): string {
  if (meta.sessionCount === 0) return '';

  const lines: string[] = [];

  // 使用频率
  if (meta.sessionCount <= 3) {
    lines.push(`- 这是用户第 ${meta.sessionCount} 次对话，还在熟悉阶段`);
  } else {
    lines.push(`- 累计对话 ${meta.sessionCount} 次`);
  }

  // 连续活跃
  if (meta.activeStreak >= 3) {
    lines.push(`- 最近 ${meta.activeStreak} 天连续使用（持续关注中）`);
  }

  // 间隔检测
  if (meta.gapDays >= 7) {
    lines.push(`- 距上次对话已 ${meta.gapDays} 天（可能需要温和重新连接）`);
  } else if (meta.gapDays >= 3) {
    lines.push(`- 距上次对话 ${meta.gapDays} 天`);
  }

  // 深夜使用信号
  if (meta.avgSessionHour != null) {
    const hour = Math.round(meta.avgSessionHour);
    if (hour >= 23 || hour <= 2) {
      lines.push(`- 常在深夜使用（注意可能的睡眠/情绪波动）`);
    } else if (hour >= 21) {
      lines.push(`- 常在晚间使用`);
    }
  }

  if (lines.length === 0) return '';
  return `## 用户行为模式\n${lines.join('\n')}`;
}
