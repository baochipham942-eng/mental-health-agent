import { NextRequest, NextResponse } from 'next/server.js';
import { StreamData } from 'ai';
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
import { DEFAULT_SAFE, getSafetyAgent } from '@/lib/ai/agents/safety-agent';
import { runWithTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';
import { checkRateLimit } from '@/lib/api/rate-limit';

// =================================================================================
// 预设技能卡配置 - 用于直接技能请求的快速响应
// =================================================================================
// 导出用于测试
import { SKILL_CARDS, detectDirectSkillRequest } from '@/lib/ai/skills';

// =================================================================================
// 预设技能卡配置 - 用于直接技能请求的快速响应
// =================================================================================
// 逻辑已移至 @/lib/ai/skills.ts 以避免 Route Handler 导出类型错误

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

  let finalSessionId: string | undefined;
  let finalUserId: string | undefined;
  let routeType: RouteType = 'support';
  const data = new StreamData();
  const requestStartedAt = Date.now();

  // 包裹在 Langfuse trace 上下文中，让底层 LLM 调用自动关联
  return runWithTrace('chat-request', { requestStartedAt }, async () => {
  try {
    const body: ChatRequest = await request.json();
    const { message, history = [], state, assessmentStage, model: requestedModel, provider: requestedProvider } = body;

    // 优先用显式 provider，其次从 model 名推断
    function deriveProvider(provider?: string, model?: string): LlmProviderName | undefined {
      if (provider && ['deepseek', 'openai', 'kimi', 'openrouter', 'glm'].includes(provider)) {
        return provider as LlmProviderName;
      }
      if (!model) return undefined;
      if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
      if (model.startsWith('kimi-') || model.startsWith('moonshot-')) return 'kimi';
      if (model.startsWith('deepseek-')) return 'deepseek';
      if (model.includes('/')) return 'openrouter';  // anthropic/claude-xxx, google/gemini-xxx
      if (model.startsWith('glm-')) return 'glm';
      return undefined;
    }

    const providerOverride = deriveProvider(requestedProvider, requestedModel);
    const modelOverride = requestedModel || undefined;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
    }

    // =================================================================================
    // 0.0.5 FAST SKILL CARD PATH - 极速路径，跳过所有 LLM 调用
    // =================================================================================
    const directSkillType = detectDirectSkillRequest(message);
    if (directSkillType) {
      logInfo('fast-skill-path', { skillType: directSkillType });
      const skill = SKILL_CARDS[directSkillType];

      // 异步保存消息（不阻塞）
      if (body.sessionId) {
        ChatService.saveAssistantMessage(body.sessionId, getSkillIntroMessage(directSkillType), {
          routeType: 'support', actionCards: [skill], fastSkillResponse: true
        });
      }

      return createSkillCardStreamResponse(directSkillType, data, {
        timestamp: new Date().toISOString(),
        emotion: { label: 'neutral', score: 5 },
        safety: { label: 'normal', score: 0, reasoning: '检测到明确练习请求，正在为你开启极速引导' },
      });
    }

    // =================================================================================
    // 0.1 Input Guardrail - 输入安全检测
    // =================================================================================
    const inputGuard = guardInput(message);
    if (!inputGuard.safe) {
      logWarn('input-guard-blocked', { reason: inputGuard.reason });
      const data = new StreamData();
      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'support',
        guardBlocked: inputGuard.reason || 'unknown'
      } as Record<string, string>);
      return createFixedStreamResponse(getBlockedResponse(inputGuard.reason), data);
    }

    // =================================================================================
    // 0.2 Early prefetch + Auth (并行执行，节省 ~50-200ms)
    // orchestration + crisisCheck 不依赖 userId，可在 auth 之前启动
    // =================================================================================
    const { orchestrationPromise, crisisCheckPromise } = startEarlyPrefetch({ message, history });

    const authStartedAt = Date.now();
    const session = await auth();
    const authDurationMs = Date.now() - authStartedAt;
    finalSessionId = body.sessionId;
    finalUserId = session?.user?.id;
    const sessionId = finalSessionId;
    const userId = finalUserId;

    // 非管理员不允许覆盖 LLM provider/model
    const isAdminUser = isAdminSession(session);
    const effectiveProviderOverride = isAdminUser ? providerOverride : undefined;
    const effectiveModelOverride = isAdminUser ? modelOverride : undefined;

    logInfo('chat-request', {
      hasSession: !!session,
      userId,
      sessionId: body.sessionId,
      messageLen: message.length,
      authDurationMs,
    });

    // Save User Message - 异步执行，不阻塞响应
    if (sessionId && userId) {
      ChatService.saveUserMessage(sessionId, userId, message);
    }

    const saveAssistantMessage = createAssistantMessageSaver(sessionId);

    // =================================================================================
    // 0.5 DB Prefetch (依赖 userId，auth 之后启动)
    // lastAssistantMsg 也纳入并行批次，首轮跳过不必要的查询
    // =================================================================================
    let memoryContext = '';
    let processedHistory = history;
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
    } = await buildChatPrefetchContext({
      userId,
      sessionId,
      message,
      history,
    });

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
    // 首轮直接用 fallback，跳过 triage 等待（节省 ~180ms）
    const isFirstTurn = history.length === 0;
    const triageSoftWaitStartedAt = Date.now();
    const softOrchestrationResult = isFirstTurn
      ? null
      : await Promise.race([
          orchestrationPromise,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), Number(process.env.TRIAGE_SOFT_WAIT_MS || 180))
          ),
        ]);
    logInfo('chat-soft-triage', {
      sessionId,
      userId,
      softTriageWaitMs: Date.now() - triageSoftWaitStartedAt,
      triageResolved: !!softOrchestrationResult,
      skippedForFirstTurn: isFirstTurn,
    });

    // await 预先启动的 crisis check（已与 auth + DB 并行，此处几乎为 0ms）
    const crisisCheckResult = await crisisCheckPromise;

    const routeDecision = decideRouteByRules({
      message,
      state,
      assessmentStage,
      questionnaireType,
      explicitAssessmentRequest,
      activeExercise,
      crisisCheckResult,
    });
    routeType = routeDecision.routeType;

    const analysis = softOrchestrationResult?.triage.data || buildFallbackQuickAnalysis({
      crisisCheckResult,
    });
    let safetyAgentResult = softOrchestrationResult?.safety || {
      success: false,
      data: DEFAULT_SAFE,
      latency: 0,
      agentName: 'safety-skipped',
      model: 'rules-only',
    };

    if (
      !softOrchestrationResult &&
      analysis.safety !== 'normal'
    ) {
      safetyAgentResult = await getSafetyAgent().run({
        message,
        history: history as any,
        triageSafety: analysis.safety,
      });
    }

    // 构建统一的 safety 对象（优先使用 SafetyAgent 深度评估，回退到 Triage 快速评估）
    const hasSafetyDeep = safetyAgentResult.success && safetyAgentResult.data.label !== 'normal';
    const safetyData = {
      label: hasSafetyDeep ? safetyAgentResult.data.label : analysis.safety,
      score: hasSafetyDeep ? safetyAgentResult.data.score : (analysis.safety === 'crisis' ? 9 : analysis.safety === 'urgent' ? 6 : 1),
      reasoning: hasSafetyDeep ? safetyAgentResult.data.reasoning : analysis.safetyReasoning,
      constraints: hasSafetyDeep ? (safetyAgentResult.data.constraints || []) : [],
    };

    // 计算 Adaptive Persona Mode
    const adaptiveMode = determinePersonaMode({
      safety: analysis.safety,
      emotionScore: analysis.emotion.score,
      intent: analysis.stateReasoning // Using reasoning or mapping route? Groq intent logic.
    }, assessmentHistory);

    logInfo('persona-mode', { adaptiveMode });

    // Check if retrievalResult is string (old return) or object
    if (typeof retrievalResult === 'string') {
      memoryContext = retrievalResult;
    } else if (retrievalResult && typeof retrievalResult === 'object') {
      const retrievalData = retrievalResult as any;
      memoryContext = retrievalData.contextString || retrievalData.injectedText || '';
      // 阶段3 主动推送：将相关记忆注入数据流
      if (retrievalData.memories?.length > 0) {
        data.append({
          timestamp: new Date().toISOString(),
          relevantMemories: retrievalData.memories.map((m: any) => ({
            id: m.id,
            content: m.content,
            topic: m.topic,
            sourceConvId: m.sourceConvId
          }))
        } as any);
      }
      if (retrievalData.source === 'memory-v2') {
        data.append({
          timestamp: new Date().toISOString(),
          memoryV2: {
            source: 'memory-v2',
            profileCount: retrievalData.profileMemories?.length || 0,
            summaryCount: retrievalData.recentSummaries?.length || 0,
          },
        } as any);
      }
    }

    memoryContext = buildLayeredMemoryContext({
      baseMemoryContext: memoryContext,
      userPreferences,
      userNickname: session?.user?.nickname,
    });

    // 次日回访 prompt 注入
    if (followupPrompt) {
      memoryContext = memoryContext
        ? `${memoryContext}\n\n${followupPrompt}`
        : followupPrompt;
    }

    // 情绪趋势摘要注入
    if (progressSummary) {
      memoryContext = memoryContext
        ? `${memoryContext}\n\n${progressSummary}`
        : progressSummary;
    }

    // =================================================================================
    // 0.6 Dialogue State Tracking - 对话状态追踪
    // =================================================================================
    const {
      emotionObj, conversationTurn, dialoguePhase, riskSignals,
      dialogueCtx, stateMachinePrompt,
    } = await trackDialogueState({
      analysis, message, history, sessionId, userId,
      lastAssistantMsgPromise: Promise.resolve(lastAssistantMsg),
      stateRestoreStartedAt,
    });

    // 构建对话状态对象
    const stateData = {
      reasoning: analysis.stateReasoning,
      route: routeType,
    };

    // 构建角色与记忆元数据
    const personaData = {
      mode: analysis.adaptiveMode || adaptiveMode,
      reasoning: analysis.personaReasoning || '根据对话上下文动态调整',
    };

    const memoryData = {
      check: analysis.memoryCheck || '无',
      retrieved: typeof retrievalResult !== 'string' && (retrievalResult as any).memories?.length > 0
        ? (retrievalResult as any).memories.map((m: any) => m.topic).join(', ')
        : undefined
    };

    logInfo('groq-analysis', { analysis });
    logInfo('safety-assessment', { safetyData });

    // =================================================================================
    // Agent Trace — 结构化各阶段耗时，用于评测系统可视化
    // =================================================================================
    const agentTrace: Array<{
      agent: string; startMs: number; durationMs: number;
      model?: string; skipped?: boolean; result?: string;
      input?: Record<string, any>;
      output?: Record<string, any>;
      reasoning?: string;
    }> = [];

    // Prefetch（并行 DB 查询，与 auth 并行启动）
    if (prefetchDurationMs > 0) {
      agentTrace.push({
        agent: 'prefetch',
        startMs: 0,
        durationMs: prefetchDurationMs,
      });
    }

    // Triage（并行预启动，soft-wait 等待结果）
    const triageDurationMs = softOrchestrationResult?.triage?.latency || 0;
    const triageModel = softOrchestrationResult?.triage?.model;
    agentTrace.push({
      agent: 'triage',
      startMs: 0, // 与 prefetch 并行启动
      durationMs: triageDurationMs,
      model: triageModel,
      skipped: isFirstTurn, // 首轮跳过 triage
      result: routeType,
      input: { message: message.substring(0, 200), historyLen: history.length },
      output: {
        safety: analysis.safety,
        route: analysis.route,
        emotion: analysis.emotion,
        adaptiveMode: analysis.adaptiveMode,
      },
      reasoning: analysis.safetyReasoning,
    });

    // Safety（条件触发，仅在非 normal 时执行）
    const safetySkipped = !softOrchestrationResult || safetyAgentResult.agentName === 'safety-skipped';
    const safetyDurationMs = safetyAgentResult.latency || 0;
    const safetyStartMs = triageDurationMs; // safety 在 triage 之后
    agentTrace.push({
      agent: 'safety',
      startMs: safetyStartMs,
      durationMs: safetyDurationMs,
      model: safetyAgentResult.model,
      skipped: safetySkipped,
      result: safetyData.label,
      input: { message: message.substring(0, 200), triageSafety: analysis.safety },
      output: { label: safetyData.label, score: safetyData.score, constraints: safetyData.constraints },
      reasoning: safetyData.reasoning,
    });

    // Persona（纯计算，无 IO）
    agentTrace.push({
      agent: 'persona',
      startMs: Date.now() - requestStartedAt,
      durationMs: 0,
      result: adaptiveMode,
      input: { safety: analysis.safety, emotionScore: analysis.emotion.score },
      output: { mode: adaptiveMode },
    });

    // Emotion（triage 内部计算）
    agentTrace.push({
      agent: 'emotion',
      startMs: 0,
      durationMs: 0,
      result: analysis.emotion.label,
      input: { message: message.substring(0, 200) },
      output: { label: analysis.emotion.label, score: analysis.emotion.score },
    });

    // Counselor（从 pre-stream 结束开始，duration 由前端 TTFT 补充）
    const counselorStartMs = Date.now() - requestStartedAt;
    agentTrace.push({
      agent: 'counselor',
      startMs: counselorStartMs,
      durationMs: 0, // 流式阶段，实际 duration 在 onFinish 中计算
      result: routeType,
    });

    // Append analysis and dialogue metadata to stream
    data.append({
      timestamp: new Date().toISOString(),
      safety: safetyData,
      state: stateData, // 对话状态推理
      persona: personaData, // P2: Role Assignment
      memory: memoryData, // P3: Memory Ops
      dialogue: {
        turn: conversationTurn,
        phase: dialoguePhase,
        machineState: dialogueCtx?.state,
        riskLevel: riskSignals.level,
      },
      adaptiveMode,
      questionnaireDetected: questionnaireType || undefined,
      // 评测系统需要的额外数据
      emotionTrajectory: dialogueCtx?.emotionTrajectory || [],
      dialogueIntent: (analysis as any).dialogueIntent || null,
      scebProgress: dialogueCtx?.scebProgress || null,
      agentTrace,
    } as any);

    // const data = new StreamData(); // Moved up
    const traceMetadata = { sessionId, userId };

    // 更新 Langfuse 请求级 trace 的元数据
    const { getCurrentTrace: getCtx } = await import('@/lib/observability/trace-context');
    const reqTrace = getCtx()?.trace;
    if (reqTrace) {
      updateTrace(reqTrace, {
        metadata: {
          userId, sessionId, routeType,
          emotion: analysis.emotion,
          safetyLabel: safetyData.label,
          machineState: dialogueCtx?.state,
          turn: conversationTurn,
          preStreamDurationMs: Date.now() - requestStartedAt,
        },
      });
    }

    // =================================================================================
    // 0.7 Exercise State Detection - 检测进行中的引导练习
    // =================================================================================
    let exerciseInjection = '';
    if (activeExercise && isGuidedExercise(activeExercise.exerciseType)) {
      exerciseInjection = buildExerciseSystemInjection(
        activeExercise.exerciseType as any,
        activeExercise.currentStep,
        activeExercise.totalSteps,
        activeExercise.metadata as Record<string, any> | undefined
      );
      routeType = 'support'; // 练习进行中强制走 support 路由
      logInfo('exercise-detected', { exerciseType: activeExercise.exerciseType, currentStep: activeExercise.currentStep, totalSteps: activeExercise.totalSteps });
    }

    // =================================================================================
    // 1. 危机处理 (Crisis Handler) - 最高优先级
    // =================================================================================
    const preStreamDurationMs = Date.now() - requestStartedAt;
    logInfo('chat-pre-stream-ready', {
      sessionId,
      userId,
      routeType,
      preStreamDurationMs,
      authDurationMs,
      prefetchDurationMs,
      memoryContextSource: (retrievalResult as any)?.source ?? 'memory-v2',
      memoryContextDurationMs: retrievalMetrics?.totalDurationMs,
      profileMemoryQueryDurationMs: retrievalMetrics?.profileQueryDurationMs,
      sessionSummaryQueryDurationMs: retrievalMetrics?.summaryQueryDurationMs,
      routeReason: routeDecision.reason,
      triageResolved: !!softOrchestrationResult,
    });
    logInfo('route-decision', { routeType, state, messagePreview: message.substring(0, 50) });
    if (state === 'in_crisis' || routeType === 'crisis') {
      return await handleCrisisRoute({
        data,
        message,
        history,
        processedHistory,
        sessionId,
        userId,
        traceMetadata,
        requestStartedAt,
        saveAssistantMessage,
        scheduleConversationSummaryRefresh,
        safetyData,
        stateData,
        adaptiveMode,
        state,
        emotionObj,
        analysis,
        agentTrace,
      });
    }

    // =================================================================================
    // 2. 支持处理 (Support Handler) - 积极/倾诉/中性
    // =================================================================================
    if (routeType === 'support') {
      return await handleSupportRoute({
        data,
        message,
        history,
        processedHistory,
        sessionId,
        userId,
        traceMetadata,
        requestStartedAt,
        saveAssistantMessage,
        scheduleConversationSummaryRefresh,
        safetyData,
        stateData,
        adaptiveMode,
        emotionObj,
        dialogueCtx,
        exerciseInjection,
        stateMachinePrompt,
        memoryContext,
        userTherapistPref,
        userPreferences,
        providerOverride: effectiveProviderOverride,
        modelOverride: effectiveModelOverride,
        agentTrace,
      });
    }

    // =================================================================================
    // 3. 评估处理 (Assessment Handler) - 收集循环 -> 结论
    // =================================================================================
    if (routeType === 'assessment') {
      return await handleAssessmentRoute({
        data,
        message,
        history,
        processedHistory,
        sessionId,
        userId,
        traceMetadata,
        requestStartedAt,
        saveAssistantMessage,
        scheduleConversationSummaryRefresh,
        safetyData,
        stateData,
        adaptiveMode,
        assessmentStage,
        memoryContext,
        agentTrace,
      });
    }

    // Fallback? Should cover all cases.
    await saveAssistantMessage("Unexpected error: No route matched.");
    return NextResponse.json({ error: 'Unexpected route match' }, { status: 500 });

  } catch (error: any) {
    logError('chat-api-error', { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message || 'Error processing request' }, { status: 500 });
  } finally {
    // =================================================================================
    // 异步触发记忆提取 - 不阻塞响应
    // =================================================================================
    triggerAsyncMemoryExtraction(finalSessionId, finalUserId);
  }
  }); // end runWithTrace
}
