import { memoryManager } from './manager';
import { profileMemoryService } from './profile-memory-service';
import { sessionSummaryV2Service } from './session-summary-v2-service';
import type { MemoryContextResult, ProfileMemoryRecord, SessionSummaryV2Record } from './v2-types';
import { logInfo, logWarn } from '@/lib/observability/logger';

function buildMemoryInjection(input: {
  profileMemories: ProfileMemoryRecord[];
  recentSummaries: SessionSummaryV2Record[];
}): string {
  const profileBlock = input.profileMemories.length
    ? input.profileMemories.map((m) => {
        // 探索工坊发现标注
        const labTag = m.sourceConversationId?.startsWith('lab_') ? ' (探索工坊发现)' : '';
        return `- [${m.kind}] ${m.content}${labTag}`;
      }).join('\n')
    : '';

  const summaryBlock = input.recentSummaries.length
    ? input.recentSummaries.map((s) => `- ${s.summary}`).join('\n')
    : '';

  // 记忆使用指南：让 AI 自然地引用记忆，提升用户感知
  const memoryGuide = input.profileMemories.length > 0
    ? `## 记忆使用指南
- 当记忆内容与当前话题相关时，自然地用"上次你提到过..."、"我记得你说过..."来引用
- 不要每条回复都提及记忆，只在真正相关时使用
- 不要逐条罗列记忆内容，融入对话即可`
    : '';

  return [
    profileBlock ? `## 用户稳定信息\n${profileBlock}` : '',
    summaryBlock ? `## 最近会话摘要\n${summaryBlock}` : '',
    memoryGuide,
  ].filter(Boolean).join('\n\n');
}

export class MemoryContextService {
  async getContext(
    userId: string,
    message: string,
  ): Promise<MemoryContextResult> {
    const startedAt = Date.now();
    try {
      const profilePromise = (async () => {
        const profileStartedAt = Date.now();
        const profileMemories = await profileMemoryService.listTop(userId, message, 6);
        return {
          profileMemories,
          profileQueryDurationMs: Date.now() - profileStartedAt,
        };
      })();

      const summaryPromise = (async () => {
        const summaryStartedAt = Date.now();
        const recentSummaries = await sessionSummaryV2Service.listRecent(userId, 2);
        return {
          recentSummaries,
          summaryQueryDurationMs: Date.now() - summaryStartedAt,
        };
      })();

      const [
        { profileMemories, profileQueryDurationMs },
        { recentSummaries, summaryQueryDurationMs },
      ] = await Promise.all([profilePromise, summaryPromise]);

      const totalDurationMs = Date.now() - startedAt;

      if (profileMemories.length > 0 || recentSummaries.length > 0) {
        logInfo('memory-v2-context-hit', {
          userId,
          profileCount: profileMemories.length,
          summaryCount: recentSummaries.length,
          totalDurationMs,
          profileQueryDurationMs,
          summaryQueryDurationMs,
        });
        return {
          profileMemories,
          recentSummaries,
          injectedText: buildMemoryInjection({ profileMemories, recentSummaries }),
          source: 'memory-v2',
          metrics: {
            totalDurationMs,
            profileQueryDurationMs,
            summaryQueryDurationMs,
          },
        };
      }
    } catch (error) {
      console.error('[MemoryContextService] V2 lookup failed, falling back to legacy:', error);
      logWarn('memory-v2-context-error', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const legacyStartedAt = Date.now();
    const legacy = await memoryManager.getMemoriesForContext(userId, message);
    const totalDurationMs = Date.now() - startedAt;
    const legacyDurationMs = Date.now() - legacyStartedAt;
    logInfo('memory-v2-context-fallback', {
      userId,
      legacyLength: legacy.contextString?.length || 0,
      totalDurationMs,
      legacyDurationMs,
    });
    return {
      profileMemories: [],
      recentSummaries: [],
      injectedText: legacy.contextString || '',
      source: 'legacy',
      metrics: {
        totalDurationMs,
        profileQueryDurationMs: 0,
        summaryQueryDurationMs: 0,
      },
    };
  }
}

export const memoryContextService = new MemoryContextService();
