import { prisma } from '@/lib/db/prisma';
import { memoryContextService } from '@/lib/memory';
import { orchestrate } from '@/lib/ai/agents/orchestrator';
import { quickCrisisCheck } from '@/lib/ai/crisis-classifier';
import { checkFollowupNeeded } from '@/lib/ai/followup-check';
import { getProgressSummaryForChat } from '@/lib/ai/progress/tracker';
import { logInfo, logWarn } from '@/lib/observability/logger';
import type { ChatMessage } from '@/lib/ai/deepseek';

/**
 * 启动不依赖 userId 的并行任务（auth 之前即可调用）
 * 让 orchestration + crisisCheck 与 auth() 并行执行，节省 ~50-200ms
 */
export function startEarlyPrefetch(params: {
  message: string;
  history: Array<{ role: string; content: string }>;
}) {
  const { message, history } = params;
  const recentContext = history.slice(-2);

  const orchestrationPromise = orchestrate({
    message,
    history: history as ChatMessage[],
    recentHistory: recentContext,
  }).catch((error) => {
    logWarn('prefetch-orchestration-failed', { error: String(error) });
    return null;
  });

  const crisisCheckPromise = quickCrisisCheck(message);

  return { orchestrationPromise, crisisCheckPromise };
}

/**
 * 启动依赖 userId 的 DB 查询（auth 之后调用）
 * 首轮对话跳过不必要的 DB 查询（assessment/preference/therapist）
 */
export async function buildChatPrefetchContext(params: {
  userId?: string;
  sessionId?: string;
  message: string;
  history: Array<{ role: string; content: string }>;
}) {
  const { userId, sessionId, message, history } = params;
  const prefetchStartedAt = Date.now();
  const shouldSkipDb = process.env.SKIP_PRISMA_DB === '1';
  const isFirstTurn = history.length === 0;

  const memoryPromise = (userId && history.length > 0)
    ? (async () => {
      try {
        return await memoryContextService.getContext(userId, message);
      } catch (e) {
        logWarn('memory-context-failed', { error: String(e) });
      }
      return { injectedText: '', source: 'legacy' as const, profileMemories: [], recentSummaries: [] };
    })()
    : Promise.resolve({ injectedText: '', source: 'legacy' as const, profileMemories: [], recentSummaries: [] });

  // 首轮对话跳过 assessment/preference/therapist 查询（用户还没说有意义的话）
  const assessmentPromise = (userId && !isFirstTurn)
    ? (!shouldSkipDb
      ? prisma.assessmentReport.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
      : Promise.resolve([]))
    : Promise.resolve([]);

  const preferencePromise = (userId && !isFirstTurn)
    ? (!shouldSkipDb
      ? prisma.userMemory.findMany({
        where: {
          userId,
          topic: { in: ['communication_style', 'coping_preference'] }
        },
        orderBy: { accessedAt: 'desc' },
        take: 5
      })
      : Promise.resolve([]))
    : Promise.resolve([]);

  // 首轮跳过 therapist/activeExercise 查询（用户还没说有意义的话）
  const therapistPromise = (userId && !isFirstTurn)
    ? (!shouldSkipDb
      ? prisma.user.findUnique({
        where: { id: userId },
        select: { preferredTherapist: true }
      })
      : Promise.resolve(null))
    : Promise.resolve(null);

  const activeExercisePromise = (userId && !isFirstTurn)
    ? (!shouldSkipDb
      ? prisma.exerciseState.findFirst({
        where: { userId, status: 'in_progress' },
        orderBy: { updatedAt: 'desc' },
      })
      : Promise.resolve(null))
    : Promise.resolve(null);

  // 首轮对话时检查次日回访
  const followupPromise = (userId && isFirstTurn)
    ? checkFollowupNeeded(userId).catch(() => null)
    : Promise.resolve(null);

  // 非首轮时获取进度摘要（用于 AI 主动回顾）
  const progressSummaryPromise = (userId && !isFirstTurn)
    ? getProgressSummaryForChat(userId).catch(() => null)
    : Promise.resolve(null);

  // lastAssistantMsg 也纳入并行批次（之前在 route.ts 中单独启动）
  const lastAssistantMsgPromise = (sessionId && !shouldSkipDb)
    ? prisma.message.findFirst({
      where: { conversationId: sessionId, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
      select: { meta: true },
    }).catch((error) => {
      logWarn('state-machine-query-failed', { error: String(error) });
      return null;
    })
    : Promise.resolve(null);

  const [
    retrievalResult,
    assessmentHistory,
    preferenceMemories,
    userTherapistPref,
    activeExercise,
    lastAssistantMsg,
    followupPrompt,
    progressSummary,
  ] = await Promise.all([
    memoryPromise,
    assessmentPromise,
    preferencePromise,
    therapistPromise,
    activeExercisePromise,
    lastAssistantMsgPromise,
    followupPromise,
    progressSummaryPromise,
  ]);

  const prefetchDurationMs = Date.now() - prefetchStartedAt;
  const retrievalMetrics =
    retrievalResult && typeof retrievalResult === 'object' && 'metrics' in retrievalResult
      ? (retrievalResult as any).metrics
      : undefined;
  logInfo('chat-prefetch-complete', {
    sessionId,
    userId,
    prefetchDurationMs,
    historyLen: history.length,
    isFirstTurn,
    hasActiveExercise: !!activeExercise,
    preferenceCount: preferenceMemories.length,
    assessmentCount: assessmentHistory.length,
    memoryContextSource: typeof retrievalResult === 'string' ? 'legacy' : (retrievalResult as any)?.source,
    memoryContextDurationMs: retrievalMetrics?.totalDurationMs,
    profileMemoryQueryDurationMs: retrievalMetrics?.profileQueryDurationMs,
    sessionSummaryQueryDurationMs: retrievalMetrics?.summaryQueryDurationMs,
  });

  return {
    retrievalResult,
    assessmentHistory,
    preferenceMemories,
    userTherapistPref,
    activeExercise,
    lastAssistantMsg,
    followupPrompt,
    progressSummary,
    prefetchDurationMs,
  };
}
