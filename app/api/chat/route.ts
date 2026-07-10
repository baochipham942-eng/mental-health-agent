import { NextRequest, NextResponse } from 'next/server.js';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { ChatUIMessage } from '@/types/chat-ui-message';
import { auth } from '@/lib/runtime/chat-auth';
import { isAdminSession } from '@/lib/auth/admin';
import { ChatRequest, RouteType } from '@/types/chat';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import type { LlmProviderName } from '@/lib/llm';
import { logInfo, logWarn, logError } from '@/lib/observability/logger';
import { detectQuestionnaireRequest } from '@/lib/ai/assessment/questionnaire';
import { ChatService } from '@/lib/services/chat-service';
import { determinePersonaMode } from '@/lib/ai/persona-manager';
import { isGuidedExercise, buildExerciseSystemInjection } from '@/lib/ai/exercise-engine';
import { resolveCrisisCheckWithSoftWait } from '@/lib/ai/crisis-classifier';
import { startEarlyPrefetch, buildChatPrefetchContext } from './prefetch';
import {
  handleAssessmentRoute,
  handleCrisisRoute,
  handleSupportRoute,
} from './handlers';
import {
  buildFallbackQuickAnalysis,
  buildLayeredMemoryContext,
  createAssistantMessageSaver,
  createFixedStreamResponse,
  createSkillCardStreamResponse,
  decideRouteByRules,
  detectExplicitAssessmentRequest,
  getSkillIntroMessage,
  scheduleConversationSummaryRefresh,
  trackDialogueState,
  triggerAsyncMemoryExtraction,
} from './route-helpers';
import { writeChatPreludeMetadata } from './response-visibility';
import { DEFAULT_SAFE, getSafetyAgent } from '@/lib/ai/agents/safety-agent';
import { runWithTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { chatBodySchema, clampChatHistory } from '@/lib/api/chat-request-schema';
import { SKILL_CARDS, detectDirectSkillRequest } from '@/lib/ai/skills';
import { resolveSceneContext } from '@/lib/ai/scene';
import { assessWebSearchNeed, executeWebSearchIfNeeded, resolveWebSearchCapability } from '@/lib/ai/websearch';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Rate limiting: 单 IP 每分钟最多 15 次请求
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const rl = checkRateLimit(`chat:${clientIp}`, 15, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)) } },
    );
  }

  const requestStartedAt = Date.now();

  // Parse body up front — early-bail errors should return JSON, not stream
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { message } = body;
  if (!message || message.trim().length === 0) {
    return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
  }

  // 0.0.2 请求体校验：role 枚举/长度/条数钳制，system 角色在此被拒。
  // 客户端发全量历史，长会话会自然超过上限——先钳制（留最近的）再校验，避免老会话永久 400
  (body as { history?: unknown }).history = clampChatHistory(body.history);
  const bodyCheck = chatBodySchema.safeParse(body);
  if (!bodyCheck.success) {
    const issue = bodyCheck.error.issues[0];
    logWarn('chat-request-invalid', { path: issue?.path?.join('.'), code: issue?.code });
    return NextResponse.json({ error: '请求参数不合法' }, { status: 400 });
  }

  // 0.0.3 服务端可信会话边界：匿名请求忽略传入 sessionId；登录用户校验 conversation 归属
  const authStartedAt = Date.now();
  const session = await auth();
  const authDurationMs = Date.now() - authStartedAt;
  const userId: string | undefined = session?.user?.id;
  const sessionId: string | undefined = userId ? body.sessionId : undefined;
  if (sessionId && userId) {
    const owned = await ChatService.verifyConversationOwnership(sessionId, userId);
    if (!owned) {
      logWarn('chat-session-ownership-denied', { sessionId, userId });
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 });
    }
  }

  // 0.0.5 FAST SKILL CARD PATH - 极速路径，跳过所有 LLM 调用
  const directSkillType = detectDirectSkillRequest(message);
  if (directSkillType) {
    logInfo('fast-skill-path', { skillType: directSkillType });
    const skill = SKILL_CARDS[directSkillType];

    if (sessionId) {
      ChatService.saveAssistantMessage(sessionId, getSkillIntroMessage(directSkillType), {
        routeType: 'support', actionCards: [skill], fastSkillResponse: true,
      });
    }

    return createSkillCardStreamResponse(directSkillType, {
      emotion: { label: 'neutral', score: 5 },
      safety: isAdminSession(session)
        ? {
            label: 'normal',
            score: 0,
            reasoning: '检测到明确练习请求，正在为你开启极速引导',
            constraints: [],
          }
        : undefined,
    });
  }

  // 0.1 Input Guardrail - 输入安全检测
  const inputGuard = guardInput(message);
  if (!inputGuard.safe) {
    logWarn('input-guard-blocked', { reason: inputGuard.reason });
    return createFixedStreamResponse(getBlockedResponse(inputGuard.reason), [
      { type: 'data-route', data: { routeType: 'support' } },
      { type: 'data-guard-input-blocked', data: { reason: inputGuard.reason || 'unknown' } },
    ]);
  }

  return runWithTrace('chat-request', { requestStartedAt }, async () => {
    const stream = createUIMessageStream<ChatUIMessage>({
      execute: async ({ writer }) => {
        const { history = [], state, assessmentStage, model: requestedModel, provider: requestedProvider } = body;
        let routeType: RouteType = 'support';

        // 优先用显式 provider，其次从 model 名推断
        function deriveProvider(provider?: string, model?: string): LlmProviderName | undefined {
          if (provider && ['deepseek', 'openai', 'kimi', 'openrouter', 'glm'].includes(provider)) {
            return provider as LlmProviderName;
          }
          if (!model) return undefined;
          if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
          if (model.startsWith('kimi-') || model.startsWith('moonshot-')) return 'kimi';
          if (model.startsWith('deepseek-')) return 'deepseek';
          if (model.includes('/')) return 'openrouter';
          if (model.startsWith('glm-')) return 'glm';
          return undefined;
        }

        const providerOverride = deriveProvider(requestedProvider, requestedModel);
        const modelOverride = requestedModel || undefined;

        // 0.2 Early prefetch（auth 已在路由入口完成，sessionId 已过归属校验）
        const { orchestrationPromise, crisisCheckPromise } = startEarlyPrefetch({ message, history });

        const isAdminUser = isAdminSession(session);
        const effectiveProviderOverride = isAdminUser ? providerOverride : undefined;
        const effectiveModelOverride = isAdminUser ? modelOverride : undefined;

        logInfo('chat-request', {
          hasSession: !!session,
          userId,
          sessionId,
          messageLen: message.length,
          authDurationMs,
        });

        if (sessionId && userId) {
          ChatService.saveUserMessage(sessionId, userId, message);
        }

        // crisis LLM soft-wait 超时标记（两段式危机检查见下方 0.55）
        let crisisLlmTimedOut = false;

        const baseSaveAssistantMessage = createAssistantMessageSaver(sessionId);
        // LLM 危机结果晚到（soft-wait 超时后才返回 true）时写入本轮消息 meta，供下一轮升级为 crisis 路由。
        // quickCrisisCheck 内部有 CRISIS_CHECK_TIMEOUT_MS 兜底，这里的 await 有界且在流结束后执行，不占关键路径。
        const saveAssistantMessage: typeof baseSaveAssistantMessage = async (content, meta) => {
          if (crisisLlmTimedOut && sessionId && routeType !== 'crisis') {
            const lateCrisis = await crisisCheckPromise.catch(() => false);
            if (lateCrisis) {
              logWarn('crisis-late-escalation-flagged', { sessionId, userId });
              meta = { ...meta, pendingCrisisEscalation: true };
            }
          }
          return baseSaveAssistantMessage(content, meta);
        };

        // 0.5 DB Prefetch
        let memoryContext = '';
        const processedHistory = history;
        const stateRestoreStartedAt = Date.now();

        const {
          retrievalResult,
          assessmentHistory,
          preferenceMemories,
          userTherapistPref,
          activeExercise,
          lastAssistantMsg,
          followupPrompt,
          progressSummary,
          prefetchDurationMs,
        } = await buildChatPrefetchContext({ userId, sessionId, message, history });

        const userPreferences = preferenceMemories.map((m: any) => m.content);
        const retrievalMetrics =
          retrievalResult && typeof retrievalResult === 'object' && 'metrics' in retrievalResult
            ? (retrievalResult as any).metrics
            : undefined;

        const questionnaireType = detectQuestionnaireRequest(message);
        const explicitAssessmentRequest = detectExplicitAssessmentRequest(message);
        if (questionnaireType) {
          logInfo('questionnaire-trigger', { type: questionnaireType, source: 'user_request' });
        }

        // soft-wait: 等 orchestration 最多 180ms，超时用 fallback
        const isFirstTurn = history.length === 0;
        const triageSoftWaitStartedAt = Date.now();
        const softOrchestrationResult = isFirstTurn
          ? null
          : await Promise.race([
              orchestrationPromise,
              new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), Number(process.env.TRIAGE_SOFT_WAIT_MS || 180)),
              ),
            ]);
        logInfo('chat-soft-triage', {
          sessionId, userId,
          softTriageWaitMs: Date.now() - triageSoftWaitStartedAt,
          triageResolved: !!softOrchestrationResult,
          skippedForFirstTurn: isFirstTurn,
        });

        // 0.55 crisis check 两段式：同步关键词快筛命中立即阻断（安全底线，不许软化）；
        // LLM 语义评估只 soft-wait，超时先走 support 流，晚到的危机结果经 saveAssistantMessage 记录供下一轮升级
        const crisisSoftWaitStartedAt = Date.now();
        const crisisCheck = await resolveCrisisCheckWithSoftWait({ message, crisisCheckPromise });
        crisisLlmTimedOut = crisisCheck.llmTimedOut;
        const pendingCrisisEscalation =
          !crisisCheck.isCrisis && (lastAssistantMsg?.meta as any)?.pendingCrisisEscalation === true;
        const crisisCheckResult = crisisCheck.isCrisis || pendingCrisisEscalation;
        logInfo('chat-crisis-check', {
          sessionId, userId,
          crisisSoftWaitMs: Date.now() - crisisSoftWaitStartedAt,
          keywordHit: crisisCheck.keywordHit,
          llmTimedOut: crisisCheck.llmTimedOut,
          pendingCrisisEscalation,
          crisisCheckResult,
        });

        const routeDecision = decideRouteByRules({
          message, state, assessmentStage, questionnaireType,
          explicitAssessmentRequest, activeExercise, crisisCheckResult,
        });
        routeType = routeDecision.routeType;

        const analysis = softOrchestrationResult?.triage.data || buildFallbackQuickAnalysis({ crisisCheckResult });

        // crisis LLM 超时时用 triage 的安全判定补位：两个独立信号不该被一次超时同时丢掉
        if (crisisCheck.llmTimedOut && routeType !== 'crisis'
          && (analysis.safety === 'crisis' || analysis.safety === 'urgent')) {
          logWarn('chat-crisis-escalated-by-triage', { sessionId, userId, triageSafety: analysis.safety });
          routeType = 'crisis';
        }
        let safetyAgentResult = softOrchestrationResult?.safety || {
          success: false,
          data: DEFAULT_SAFE,
          latency: 0,
          agentName: 'safety-skipped',
          model: 'rules-only',
        };

        if (!softOrchestrationResult && analysis.safety !== 'normal') {
          safetyAgentResult = await getSafetyAgent().run({
            message,
            history: history as any,
            triageSafety: analysis.safety,
          });
        }

        const hasSafetyDeep = safetyAgentResult.success && safetyAgentResult.data.label !== 'normal';
        const safetyData = {
          label: hasSafetyDeep ? safetyAgentResult.data.label : analysis.safety,
          score: hasSafetyDeep ? safetyAgentResult.data.score : (analysis.safety === 'crisis' ? 9 : analysis.safety === 'urgent' ? 6 : 1),
          reasoning: hasSafetyDeep ? safetyAgentResult.data.reasoning : analysis.safetyReasoning,
          constraints: hasSafetyDeep ? (safetyAgentResult.data.constraints || []) : [],
        };

        const adaptiveMode = determinePersonaMode({
          safety: analysis.safety,
          emotionScore: analysis.emotion.score,
          intent: analysis.stateReasoning,
        }, assessmentHistory);

        logInfo('persona-mode', { adaptiveMode });

        if (typeof retrievalResult === 'string') {
          memoryContext = retrievalResult;
        } else if (retrievalResult && typeof retrievalResult === 'object') {
          const retrievalData = retrievalResult as any;
          memoryContext = retrievalData.contextString || retrievalData.injectedText || '';
          if (isAdminUser && retrievalData.memories?.length > 0) {
            writer.write({
              type: 'data-relevant-memories',
              data: {
                memories: retrievalData.memories.map((m: any) => ({
                  id: m.id,
                  content: m.content,
                  topic: m.topic,
                  sourceConvId: m.sourceConvId,
                })),
              },
            });
          }
          if (isAdminUser && retrievalData.source === 'memory-v2') {
            writer.write({
              type: 'data-trace',
              data: {
                memoryV2: {
                  source: 'memory-v2',
                  profileCount: retrievalData.profileMemories?.length || 0,
                  summaryCount: retrievalData.recentSummaries?.length || 0,
                },
              },
            });
          }
        }

        memoryContext = buildLayeredMemoryContext({
          baseMemoryContext: memoryContext,
          userPreferences,
          userNickname: session?.user?.nickname,
        });

        if (followupPrompt) {
          memoryContext = memoryContext ? `${memoryContext}\n\n${followupPrompt}` : followupPrompt;
        }

        if (progressSummary) {
          memoryContext = memoryContext ? `${memoryContext}\n\n${progressSummary}` : progressSummary;
        }

        // 0.6 Dialogue State Tracking
        const {
          emotionObj, conversationTurn, dialoguePhase, riskSignals,
          dialogueCtx, stateMachinePrompt,
        } = await trackDialogueState({
          analysis, message, history, sessionId, userId,
          lastAssistantMsgPromise: Promise.resolve(lastAssistantMsg),
          stateRestoreStartedAt,
        });

        const stateData = {
          reasoning: analysis.stateReasoning,
          route: routeType,
        };

        const personaData = {
          mode: analysis.adaptiveMode || adaptiveMode,
          reasoning: analysis.personaReasoning || '根据对话上下文动态调整',
        };

        const sceneContext = resolveSceneContext({
          message,
          triageScene: analysis.scene || null,
        });

        const webSearchCapability = resolveWebSearchCapability();
        let webSearchDecision = assessWebSearchNeed({
          message,
          routeType,
          scene: sceneContext,
          capability: webSearchCapability,
        });
        const shouldExecuteWebSearch =
          webSearchCapability.mode === 'enabled' &&
          webSearchDecision.toolReady &&
          (webSearchDecision.need === 'required' ||
            (webSearchDecision.need === 'suggested' && webSearchCapability.autoSearchSuggested));

        if (shouldExecuteWebSearch) {
          writer.write({
            type: 'data-websearch-process',
            data: {
              status: 'started',
              reason: webSearchDecision.reason,
              queryHint: webSearchDecision.queryHint,
            },
          });
        }

        webSearchDecision = await executeWebSearchIfNeeded({
          message,
          scene: sceneContext,
          decision: webSearchDecision,
          capability: webSearchCapability,
        });

        if (shouldExecuteWebSearch) {
          writer.write({
            type: 'data-websearch-process',
            data: {
              status: webSearchDecision.status === 'completed' ? 'completed' : 'failed',
              reason: webSearchDecision.reason,
              error: webSearchDecision.error,
            },
          });
        }

        const memoryData = {
          check: analysis.memoryCheck || '无',
          retrieved: typeof retrievalResult !== 'string' && (retrievalResult as any).memories?.length > 0
            ? (retrievalResult as any).memories.map((m: any) => m.topic).join(', ')
            : undefined,
        };

        logInfo('groq-analysis', { analysis });
        logInfo('safety-assessment', { safetyData });

        // Agent Trace — 结构化各阶段耗时
        const agentTrace: Array<{
          agent: string; startMs: number; durationMs: number;
          model?: string; skipped?: boolean; result?: string;
          input?: Record<string, any>;
          output?: Record<string, any>;
          reasoning?: string;
        }> = [];

        if (prefetchDurationMs > 0) {
          agentTrace.push({ agent: 'prefetch', startMs: 0, durationMs: prefetchDurationMs });
        }

        const triageDurationMs = softOrchestrationResult?.triage?.latency || 0;
        const triageModel = softOrchestrationResult?.triage?.model;
        agentTrace.push({
          agent: 'triage', startMs: 0, durationMs: triageDurationMs,
          model: triageModel, skipped: isFirstTurn, result: routeType,
          input: { message: message.substring(0, 200), historyLen: history.length },
          output: {
            safety: analysis.safety, route: analysis.route,
            emotion: analysis.emotion, adaptiveMode: analysis.adaptiveMode,
            scene: sceneContext,
          },
          reasoning: analysis.safetyReasoning,
        });

        const safetySkipped = !softOrchestrationResult || safetyAgentResult.agentName === 'safety-skipped';
        const safetyDurationMs = safetyAgentResult.latency || 0;
        const safetyStartMs = triageDurationMs;
        agentTrace.push({
          agent: 'safety', startMs: safetyStartMs, durationMs: safetyDurationMs,
          model: safetyAgentResult.model, skipped: safetySkipped, result: safetyData.label,
          input: { message: message.substring(0, 200), triageSafety: analysis.safety },
          output: { label: safetyData.label, score: safetyData.score, constraints: safetyData.constraints },
          reasoning: safetyData.reasoning,
        });

        agentTrace.push({
          agent: 'persona', startMs: Date.now() - requestStartedAt, durationMs: 0,
          result: adaptiveMode,
          input: { safety: analysis.safety, emotionScore: analysis.emotion.score },
          output: { mode: adaptiveMode },
        });

        agentTrace.push({
          agent: 'emotion', startMs: 0, durationMs: 0, result: analysis.emotion.label,
          input: { message: message.substring(0, 200) },
          output: { label: analysis.emotion.label, score: analysis.emotion.score },
        });

        agentTrace.push({
          agent: 'websearch',
          startMs: 0,
          durationMs: webSearchDecision.latencyMs || 0,
          result: webSearchDecision.status,
          input: {
            need: webSearchDecision.need,
            queryHint: webSearchDecision.queryHint,
            sceneId: sceneContext.id,
            sceneSource: sceneContext.source,
            sceneConfidence: sceneContext.confidence,
          },
          output: {
            status: webSearchDecision.status,
            toolReady: webSearchDecision.toolReady,
            sourceCount: webSearchDecision.sources?.length || 0,
            citationCount: webSearchDecision.citationCount,
            latencyMs: webSearchDecision.latencyMs,
            shouldOfferSearch: webSearchDecision.shouldOfferSearch,
          },
          reasoning: webSearchDecision.reason,
        } as any);

        const counselorStartMs = Date.now() - requestStartedAt;
        agentTrace.push({
          agent: 'counselor', startMs: counselorStartMs, durationMs: 0, result: routeType,
        });

        // ============================================================
        // 写入 pre-stream 元数据 parts（内部分析仅管理员可见）
        // ============================================================
        writeChatPreludeMetadata(writer, {
          isAdmin: isAdminUser,
          routeType,
          sceneContext,
          webSearchDecision,
          adaptiveMode,
          stateData,
          safetyData,
          personaData,
          memoryData,
          dialogueData: {
            turn: conversationTurn,
            phase: dialoguePhase,
            machineState: dialogueCtx?.state,
            riskLevel: riskSignals.level,
          },
          traceData: {
            questionnaireDetected: questionnaireType || undefined,
            emotionTrajectory: dialogueCtx?.emotionTrajectory || [],
            dialogueIntent: (analysis as any).dialogueIntent || null,
            scene: sceneContext,
            webSearch: webSearchDecision,
            scebProgress: dialogueCtx?.scebProgress || null,
            agentTrace,
          },
        });

        const traceMetadata = { sessionId, userId };

        const { getCurrentTrace: getCtx } = await import('@/lib/observability/trace-context');
        const reqTrace = getCtx()?.trace;
        if (reqTrace) {
          updateTrace(reqTrace, {
            metadata: {
              userId, sessionId, routeType,
              emotion: analysis.emotion,
              safetyLabel: safetyData.label,
              scene: sceneContext,
              sceneId: sceneContext.id,
              sceneSource: sceneContext.source,
              sceneConfidence: sceneContext.confidence,
              webSearch: webSearchDecision,
              webSearchNeed: webSearchDecision.need,
              webSearchStatus: webSearchDecision.status,
              webSearchLatencyMs: webSearchDecision.latencyMs,
              webSearchCitationCount: webSearchDecision.citationCount,
              machineState: dialogueCtx?.state,
              turn: conversationTurn,
              preStreamDurationMs: Date.now() - requestStartedAt,
            },
          });
        }

        // 0.7 Exercise State Detection
        let exerciseInjection = '';
        if (activeExercise && isGuidedExercise(activeExercise.exerciseType)) {
          exerciseInjection = buildExerciseSystemInjection(
            activeExercise.exerciseType as any,
            activeExercise.currentStep,
            activeExercise.totalSteps,
            activeExercise.metadata as Record<string, any> | undefined,
          );
          routeType = 'support';
          logInfo('exercise-detected', {
            exerciseType: activeExercise.exerciseType,
            currentStep: activeExercise.currentStep,
            totalSteps: activeExercise.totalSteps,
          });
        }

        const preStreamDurationMs = Date.now() - requestStartedAt;
        logInfo('chat-pre-stream-ready', {
          sessionId, userId, routeType, preStreamDurationMs, authDurationMs, prefetchDurationMs,
          memoryContextSource: (retrievalResult as any)?.source ?? 'memory-v2',
          memoryContextDurationMs: retrievalMetrics?.totalDurationMs,
          profileMemoryQueryDurationMs: retrievalMetrics?.profileQueryDurationMs,
          sessionSummaryQueryDurationMs: retrievalMetrics?.summaryQueryDurationMs,
          routeReason: routeDecision.reason,
          triageResolved: !!softOrchestrationResult,
        });
        logInfo('route-decision', { routeType, state, messagePreview: message.substring(0, 50) });

        // ============================================================
        // 路由分发 — handlers 现在写入 writer，不返回 Response
        // ============================================================
        if (state === 'in_crisis' || routeType === 'crisis') {
          await handleCrisisRoute({
            writer, message, history, processedHistory, sessionId, userId, traceMetadata,
            requestStartedAt, saveAssistantMessage, scheduleConversationSummaryRefresh,
            safetyData, stateData, adaptiveMode, state, emotionObj, analysis, agentTrace,
            sceneContext, webSearchDecision,
          });
        } else if (routeType === 'support') {
          await handleSupportRoute({
            writer, message, history, processedHistory, sessionId, userId, traceMetadata,
            requestStartedAt, saveAssistantMessage, scheduleConversationSummaryRefresh,
            safetyData, stateData, adaptiveMode, emotionObj, dialogueCtx,
            exerciseInjection, stateMachinePrompt, memoryContext, userTherapistPref,
            userPreferences, providerOverride: effectiveProviderOverride,
            modelOverride: effectiveModelOverride, agentTrace,
            sceneContext, webSearchDecision,
            dialogueIntent: (analysis as any)?.dialogueIntent || undefined,
          });
        } else if (routeType === 'assessment') {
          await handleAssessmentRoute({
            writer, message, history, processedHistory, sessionId, userId, traceMetadata,
            requestStartedAt, saveAssistantMessage, scheduleConversationSummaryRefresh,
            safetyData, stateData, adaptiveMode, assessmentStage, memoryContext, agentTrace,
            sceneContext, webSearchDecision,
          });
        } else {
          // Fallback — should not reach here
          await saveAssistantMessage('Unexpected error: No route matched.');
          throw new Error('Unexpected route match');
        }

        // 记忆提取必须在 execute 内、handler 完成后触发：此处 sessionId/userId 已确定。
        // 旧实现把触发放在 stream 创建后的微任务里（见下方已删代码），那时 execute 尚未执行、
        // finalSessionId/finalUserId 仍是 undefined，导致 triggerAsyncMemoryExtraction 早退，
        // 聊天记忆永不生成（#16 根因）。
        if (sessionId && userId) {
          triggerAsyncMemoryExtraction(sessionId, userId);
        }
      },
      onError: (error) => {
        logError('chat-api-stream-error', {
          error: error instanceof Error ? error.message : String(error),
        });
        return error instanceof Error ? error.message : '聊天处理失败';
      },
    });

    return createUIMessageStreamResponse({ stream });
  });
}
