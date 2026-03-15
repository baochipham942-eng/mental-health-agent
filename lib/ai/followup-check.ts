/**
 * 次日回访检测
 *
 * 无推送能力，改为"用户下次打开时检测"策略：
 * 查询 24-48h 内完成的练习且无后续对话 → 返回回访 prompt
 */

import { prisma } from '@/lib/db/prisma';
import { logInfo } from '@/lib/observability/logger';

/**
 * 检查是否需要回访
 * @returns 回访 prompt 或 null
 */
export async function checkFollowupNeeded(userId: string): Promise<string | null> {
  const now = new Date();
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  try {
    // 查找 24-48h 内完成的练习（字段: type, postMood）
    const recentExercises = await prisma.exerciseLog.findMany({
      where: {
        userId,
        completedAt: {
          gte: h48Ago,
          lte: h24Ago,
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 3,
    });

    if (recentExercises.length === 0) return null;

    // 检查这些练习之后是否有新的对话
    const latestExercise = recentExercises[0];
    const hasFollowupChat = await prisma.message.findFirst({
      where: {
        conversation: { userId },
        role: 'user',
        createdAt: { gt: latestExercise.completedAt },
      },
    });

    if (hasFollowupChat) return null;

    // 构建回访 prompt（使用 type 字段，postMood 作为评分）
    const exerciseNames = recentExercises.map((e) => e.type).join('、');
    const avgScore = recentExercises.reduce((sum, e) => sum + (e.postMood || 3), 0) / recentExercises.length;

    logInfo('followup-check-triggered', {
      userId,
      exerciseCount: recentExercises.length,
      exerciseTypes: exerciseNames,
      avgScore,
    });

    const firstType = recentExercises[0].type;
    if (avgScore >= 4) {
      return `[回访提醒] 用户上次做了${exerciseNames}练习，评分不错（${avgScore.toFixed(1)}/5）。请自然地提及："上次的${firstType}练习感觉还不错呢，这两天状态怎么样？有没有自己试着练过？"`;
    } else if (avgScore >= 3) {
      return `[回访提醒] 用户上次做了${exerciseNames}练习，感觉一般（${avgScore.toFixed(1)}/5）。请温和地关心："上次做完${firstType}之后，有没有感觉好一点？如果没有也没关系，我们可以试试别的方式。"`;
    } else {
      return `[回访提醒] 用户上次做了${exerciseNames}练习，当时感觉不太好（${avgScore.toFixed(1)}/5）。请关切地询问："上次练习完你好像还是有点难受，这两天好些了吗？不管怎样，愿意回来聊聊就很好了。"`;
    }
  } catch (error) {
    console.error('[FollowupCheck] Failed:', error);
    return null;
  }
}
