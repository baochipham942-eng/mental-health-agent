import { prisma } from '@/lib/db/prisma';
import { memoryContextService } from '@/lib/memory';
import { orchestrate } from '@/lib/ai/agents/orchestrator';
import { logInfo } from '@/lib/observability/logger';
import type { ChatMessage } from '@/lib/ai/deepseek';

export async function buildChatPrefetchContext(params: {
  userId?: string;
  sessionId?: string;
  message: string;
  history: Array<{ role: string; content: string }>;
}) {
  const { userId, sessionId, message, history } = params;
  const prefetchStartedAt = Date.now();
  const recentContext = history.slice(-2);

  const orchestratePromise = orchestrate({
    message,
    history: history as ChatMessage[],
    recentHistory: recentContext,
  });

  const memoryPromise = (userId && history.length > 0)
    ? (async () => {
      try {
        return await memoryContextService.getContext(userId, message);
      } catch (e) {
        console.error('[Memory] Failed:', e);
      }
      return { injectedText: '', source: 'legacy' as const, profileMemories: [], recentSummaries: [] };
    })()
    : Promise.resolve({ injectedText: '', source: 'legacy' as const, profileMemories: [], recentSummaries: [] });

  const assessmentPromise = userId
    ? prisma.assessmentReport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    }).catch(() => [])
    : Promise.resolve([]);

  const preferencePromise = userId
    ? prisma.userMemory.findMany({
      where: {
        userId,
        topic: { in: ['communication_style', 'coping_preference'] }
      },
      orderBy: { accessedAt: 'desc' },
      take: 5
    }).catch(() => [])
    : Promise.resolve([]);

  const therapistPromise = userId
    ? prisma.user.findUnique({
      where: { id: userId },
      select: { preferredTherapist: true }
    }).catch(() => null)
    : Promise.resolve(null);

  const activeExercisePromise = userId
    ? prisma.exerciseState.findFirst({
      where: { userId, status: 'in_progress' },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => null)
    : Promise.resolve(null);

  const [
    orchestrationResult,
    retrievalResult,
    assessmentHistory,
    preferenceMemories,
    userTherapistPref,
    activeExercise,
  ] = await Promise.all([
    orchestratePromise,
    memoryPromise,
    assessmentPromise,
    preferencePromise,
    therapistPromise,
    activeExercisePromise,
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
    hasActiveExercise: !!activeExercise,
    preferenceCount: preferenceMemories.length,
    assessmentCount: assessmentHistory.length,
    memoryContextSource: typeof retrievalResult === 'string' ? 'legacy' : (retrievalResult as any)?.source,
    memoryContextDurationMs: retrievalMetrics?.totalDurationMs,
    profileMemoryQueryDurationMs: retrievalMetrics?.profileQueryDurationMs,
    sessionSummaryQueryDurationMs: retrievalMetrics?.summaryQueryDurationMs,
  });

  return {
    orchestrationResult,
    retrievalResult,
    assessmentHistory,
    preferenceMemories,
    userTherapistPref,
    activeExercise,
    prefetchDurationMs,
  };
}
