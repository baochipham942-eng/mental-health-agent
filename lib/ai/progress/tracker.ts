/**
 * 纵向进度追踪器
 *
 * 采集、聚合和分析用户的心理健康进度数据：
 * - 情绪趋势（来自会话摘要）
 * - PHQ-9/GAD-7 评分变化
 * - 练习频率与效果
 * - 里程碑检测
 */

import { prisma } from '@/lib/db/prisma';

// =============================================================================
// 类型定义
// =============================================================================

export interface ProgressTimeline {
  emotions: { date: string; value: number }[];
  phq9Scores: { date: string; score: number; severity: string }[];
  gad7Scores: { date: string; score: number; severity: string }[];
  exerciseCount: number;
  sessionCount: number;
  labSessionCount: number;
  labExplorations: { date: string; labType: string; title: string }[];
  trend: 'improving' | 'stable' | 'worsening';
  milestones: string[];
}

// =============================================================================
// 数据写入
// =============================================================================

/**
 * 记录进度指标
 */
export async function recordMetric(
  userId: string,
  type: string,
  value: number,
  sessionId?: string,
  note?: string,
): Promise<void> {
  try {
    await prisma.progressMetric.create({
      data: {
        userId,
        metricType: type,
        value,
        sessionId,
        note,
      },
    });
  } catch (error) {
    console.error('[ProgressTracker] Failed to record metric:', error);
  }
}

/**
 * 从会话摘要中提取并记录情绪指标
 *
 * 在 summarizer 生成 SessionSummary 后调用
 */
export async function recordSessionMetrics(
  userId: string,
  sessionId: string,
  emotionFinal: { label: string; score: number },
  moodChange?: number | null,
): Promise<void> {
  const promises: Promise<void>[] = [];

  // 记录最终情绪分数
  promises.push(
    recordMetric(userId, 'emotion', emotionFinal.score, sessionId, emotionFinal.label),
  );

  // 记录情绪变化差值
  if (moodChange !== undefined && moodChange !== null) {
    promises.push(
      recordMetric(userId, 'session_mood_delta', moodChange, sessionId),
    );
  }

  await Promise.all(promises);
}

// =============================================================================
// 数据读取
// =============================================================================

/**
 * 获取用户进度时间线
 */
export async function getProgressTimeline(
  userId: string,
  days: number = 30,
): Promise<ProgressTimeline> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // 并行查询各项数据
  const [metrics, questionnaireScores, exerciseLogs, sessionSummaries, labSessions] = await Promise.all([
    prisma.progressMetric.findMany({
      where: { userId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    }),
    prisma.questionnaireScore.findMany({
      where: { userId, completedAt: { gte: since } },
      orderBy: { completedAt: 'asc' },
    }),
    prisma.exerciseLog.findMany({
      where: { userId, completedAt: { gte: since } },
    }),
    prisma.sessionSummary.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.labSession.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, labType: true, title: true },
    }),
  ]);

  // 情绪趋势（来自 ProgressMetric + SessionSummary）
  const emotions: { date: string; value: number }[] = [];

  // 优先使用 ProgressMetric 中的 emotion 数据
  const emotionMetrics = metrics.filter((m: any) => m.metricType === 'emotion');
  for (const m of emotionMetrics) {
    emotions.push({
      date: m.recordedAt.toISOString().split('T')[0],
      value: m.value,
    });
  }

  // 如果 ProgressMetric 没有数据，从 SessionSummary 回退
  if (emotions.length === 0) {
    for (const s of sessionSummaries) {
      const ef = s.emotionFinal as any;
      if (ef && typeof ef.score === 'number') {
        emotions.push({
          date: s.createdAt.toISOString().split('T')[0],
          value: ef.score,
        });
      }
    }
  }

  // PHQ-9 / GAD-7 评分
  const phq9Scores = questionnaireScores
    .filter((q: any) => q.type === 'phq9')
    .map((q: any) => ({
      date: q.completedAt.toISOString().split('T')[0],
      score: q.score,
      severity: q.severity,
    }));

  const gad7Scores = questionnaireScores
    .filter((q: any) => q.type === 'gad7')
    .map((q: any) => ({
      date: q.completedAt.toISOString().split('T')[0],
      score: q.score,
      severity: q.severity,
    }));

  // 趋势计算
  const trend = calculateTrend(emotions);

  // 实验室探索记录
  const labExplorations = labSessions.map((s: any) => ({
    date: s.createdAt.toISOString().split('T')[0],
    labType: s.labType,
    title: s.title || '未命名探索',
  }));

  // 里程碑检测
  const milestones = await detectMilestones(userId, emotions, questionnaireScores, exerciseLogs, labSessions);

  return {
    emotions,
    phq9Scores,
    gad7Scores,
    exerciseCount: exerciseLogs.length,
    sessionCount: sessionSummaries.length,
    labSessionCount: labSessions.length,
    labExplorations,
    trend,
    milestones,
  };
}

// =============================================================================
// 趋势与里程碑
// =============================================================================

/**
 * 计算情绪趋势
 *
 * 比较最近 1/3 和最早 1/3 的情绪均值：
 * - 下降 > 1 分 → improving
 * - 上升 > 1 分 → worsening
 * - 其他 → stable
 */
function calculateTrend(
  emotions: { date: string; value: number }[],
): 'improving' | 'stable' | 'worsening' {
  if (emotions.length < 3) return 'stable';

  const third = Math.ceil(emotions.length / 3);
  const early = emotions.slice(0, third);
  const recent = emotions.slice(-third);

  const earlyAvg = early.reduce((s, e) => s + e.value, 0) / early.length;
  const recentAvg = recent.reduce((s, e) => s + e.value, 0) / recent.length;

  // 情绪分数越高表示越强烈（负面），所以下降 = 改善
  const delta = recentAvg - earlyAvg;
  if (delta < -1) return 'improving';
  if (delta > 1) return 'worsening';
  return 'stable';
}

/**
 * 检测里程碑
 */
async function detectMilestones(
  userId: string,
  emotions: { date: string; value: number }[],
  questionnaireScores: any[],
  exerciseLogs: any[],
  labSessions?: any[],
): Promise<string[]> {
  const milestones: string[] = [];

  // 连续 3 次情绪改善
  if (emotions.length >= 3) {
    const last3 = emotions.slice(-3);
    const isImproving = last3.every((e, i) => i === 0 || e.value <= last3[i - 1].value);
    if (isImproving && last3[0].value > last3[2].value) {
      milestones.push('连续 3 次会话情绪改善');
    }
  }

  // PHQ-9 分数下降
  const phq9s = questionnaireScores.filter((q: any) => q.type === 'phq9');
  if (phq9s.length >= 2) {
    const latest = phq9s[phq9s.length - 1];
    const previous = phq9s[phq9s.length - 2];
    if (latest.score < previous.score) {
      milestones.push(`PHQ-9 评分从 ${previous.score} 下降到 ${latest.score}`);
    }
    if (latest.severity === 'minimal' && previous.severity !== 'minimal') {
      milestones.push('PHQ-9 评分恢复到正常范围');
    }
  }

  // GAD-7 分数下降
  const gad7s = questionnaireScores.filter((q: any) => q.type === 'gad7');
  if (gad7s.length >= 2) {
    const latest = gad7s[gad7s.length - 1];
    const previous = gad7s[gad7s.length - 2];
    if (latest.score < previous.score) {
      milestones.push(`GAD-7 评分从 ${previous.score} 下降到 ${latest.score}`);
    }
  }

  // 练习里程碑
  if (exerciseLogs.length >= 5) milestones.push('已完成 5 次引导练习');
  if (exerciseLogs.length >= 10) milestones.push('已完成 10 次引导练习');
  if (exerciseLogs.length >= 20) milestones.push('已完成 20 次引导练习');

  // 获取总会话数
  const totalSessions = await prisma.sessionSummary.count({ where: { userId } });
  if (totalSessions >= 5) milestones.push('已完成 5 次咨询会话');
  if (totalSessions >= 10) milestones.push('已完成 10 次咨询会话');

  // 实验室探索里程碑
  if (labSessions) {
    if (labSessions.length >= 1) milestones.push('首次踏入实验室探索');
    if (labSessions.length >= 3) milestones.push('已完成 3 次实验室探索');
    const hasGroup = labSessions.some((s: any) => s.labType === 'group');
    if (hasGroup) milestones.push('尝试了圆桌论道');
  }

  return milestones;
}

/**
 * 检测并返回最新里程碑（用于对话中提示）
 */
export async function detectLatestMilestone(userId: string): Promise<string | null> {
  const timeline = await getProgressTimeline(userId, 30);
  return timeline.milestones.length > 0 ? timeline.milestones[0] : null;
}

/**
 * 生成进度摘要注入 prompt（用于 AI 主动回顾）
 *
 * 取 7 天趋势 → 生成自然语言摘要
 */
export async function getProgressSummaryForChat(userId: string): Promise<string | null> {
  try {
    const timeline = await getProgressTimeline(userId, 7);

    // 至少 2 次对话才有意义
    if (timeline.sessionCount < 2 && timeline.exerciseCount === 0) return null;

    const parts: string[] = [];

    // 情绪趋势
    if (timeline.emotions.length >= 2) {
      const trendLabel = timeline.trend === 'improving' ? '持续好转'
        : timeline.trend === 'worsening' ? '有些波动' : '相对平稳';
      parts.push(`最近 7 天情绪${trendLabel}`);
    }

    // 对话与练习统计
    if (timeline.sessionCount > 0) {
      parts.push(`${timeline.sessionCount} 次对话`);
    }
    if (timeline.exerciseCount > 0) {
      parts.push(`${timeline.exerciseCount} 次练习`);
    }
    if (timeline.labSessionCount > 0) {
      parts.push(`${timeline.labSessionCount} 次探索`);
    }

    // 里程碑
    if (timeline.milestones.length > 0) {
      parts.push(`达成：${timeline.milestones[0]}`);
    }

    if (parts.length === 0) return null;

    return `[用户近期进度] ${parts.join('，')}。当用户问到"我最近状态怎么样"或你觉得合适时，可以自然地引用这些数据鼓励用户。`;
  } catch (error) {
    console.error('[ProgressTracker] Failed to generate chat summary:', error);
    return null;
  }
}
