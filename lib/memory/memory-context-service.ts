import { profileMemoryService } from './profile-memory-service';
import { sessionSummaryV2Service } from './session-summary-v2-service';
import { getSessionMetadata, formatSessionMetadata, type SessionMetadata } from './session-metadata';
import type { MemoryContextResult, ProfileMemoryRecord, SessionSummaryV2Record } from './v2-types';
import { logInfo, logWarn } from '@/lib/observability/logger';

function buildMemoryInjection(input: {
  profileMemories: ProfileMemoryRecord[];
  recentSummaries: SessionSummaryV2Record[];
  sessionMetadataText?: string;
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
    input.sessionMetadataText || '',
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

      const metadataPromise = getSessionMetadata(userId).catch(() => null);

      const [
        { profileMemories, profileQueryDurationMs },
        { recentSummaries, summaryQueryDurationMs },
        sessionMeta,
      ] = await Promise.all([profilePromise, summaryPromise, metadataPromise]);

      const totalDurationMs = Date.now() - startedAt;

      logInfo('memory-v2-context', {
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
        injectedText: buildMemoryInjection({
          profileMemories,
          recentSummaries,
          sessionMetadataText: sessionMeta ? formatSessionMetadata(sessionMeta) : '',
        }),
        source: 'memory-v2',
        metrics: {
          totalDurationMs,
          profileQueryDurationMs,
          summaryQueryDurationMs,
        },
      };
    } catch (error) {
      const totalDurationMs = Date.now() - startedAt;
      console.error('[MemoryContextService] V2 lookup failed:', error);
      logWarn('memory-v2-context-error', {
        userId,
        totalDurationMs,
        error: error instanceof Error ? error.message : String(error),
      });

      // V2 查询失败时返回空结果，不再 fallback 到 V1
      return {
        profileMemories: [],
        recentSummaries: [],
        injectedText: '',
        source: 'memory-v2',
        metrics: {
          totalDurationMs,
          profileQueryDurationMs: 0,
          summaryQueryDurationMs: 0,
        },
      };
    }
  }
}

export const memoryContextService = new MemoryContextService();
