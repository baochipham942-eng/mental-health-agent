import { NextRequest, NextResponse } from 'next/server.js';
import { StreamData } from 'ai';
import { auth } from '@/lib/runtime/chat-auth';
import { prisma } from '@/lib/db/prisma';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { ChatRequest, RouteType } from '@/types/chat';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import type { LlmProviderName } from '@/lib/llm';
import { quickCrisisCheck } from '@/lib/ai/crisis-classifier';
import { logInfo, logWarn } from '@/lib/observability/logger';
import { analyzeRiskSignals, calculateTurn, inferPhase, shouldTriggerSafetyCheck } from '@/lib/ai/dialogue';
import {
  createInitialContext,
  restoreContext,
  evaluateTransition,
  updateSCEBProgress,
  generateStateMachinePrompt,
  type DialogueContext,
} from '@/lib/ai/dialogue/state-machine';
import { detectQuestionnaireRequest } from '@/lib/ai/assessment/questionnaire';
import { ChatService } from '@/lib/services/chat-service';
import { determinePersonaMode } from '@/lib/ai/persona-manager';
import { isGuidedExercise, buildExerciseSystemInjection } from '@/lib/ai/exercise-engine';
import { buildChatPrefetchContext } from './prefetch';
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
  triggerAsyncMemoryExtraction,
} from './route-helpers';
import { DEFAULT_SAFE, getSafetyAgent } from '@/lib/ai/agents/safety-agent';
import { runWithTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';

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
      console.log('[API] FAST PATH: Direct skill request detected, bypassing all LLM calls:', directSkillType);
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
    // 0.2 Persistence Setup
    // =================================================================================
    const authStartedAt = Date.now();
    const session = await auth();
    const authDurationMs = Date.now() - authStartedAt;
    finalSessionId = body.sessionId;
    finalUserId = session?.user?.id;
    const sessionId = finalSessionId;
    const userId = finalUserId;

    logInfo('chat-request', {
      hasSession: !!session,
      userId,
      sessionId: body.sessionId,
      messageLen: message.length,
      authDurationMs,
    });

    // Save User Message - 异步执行，不阻塞响应
    if (sessionId && userId) {
      // Return promise to not block? The original code didn't await the IIFE.
      ChatService.saveUserMessage(sessionId, userId, message);
    }

    const saveAssistantMessage = createAssistantMessageSaver(sessionId);

    // =================================================================================
    // 0.5 Memory Retrieval + Groq Analysis + Crisis Check (全部并行，节省 ~800ms)
    // =================================================================================
    let memoryContext = '';
    let processedHistory = history;
    const stateRestoreStartedAt = Date.now();
    const shouldSkipDb = process.env.SKIP_PRISMA_DB === '1';
    const lastAssistantMsgPromise = sessionId && !shouldSkipDb
      ? prisma.message.findFirst({
        where: { conversationId: sessionId, role: 'assistant' },
        orderBy: { createdAt: 'desc' },
        select: { meta: true },
      }).catch((error) => {
        console.error('[StateMachine] Failed to query last assistant message:', error);
        return null;
      })
      : Promise.resolve(null);

    // Crisis check 提前启动，与 prefetch 并行执行
    const crisisCheckPromise = quickCrisisCheck(message);

    const {
      orchestrationPromise,
      retrievalResult,
      assessmentHistory,
      preferenceMemories,
      userTherapistPref,
      activeExercise,
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

    const triageSoftWaitStartedAt = Date.now();
    const softOrchestrationResult = await Promise.race([
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
    });

    // await 预先启动的 crisis check（已与 prefetch 并行，此处几乎为 0ms）
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

    console.log('[Persona] Adaptive Mode:', adaptiveMode);

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

    // =================================================================================
    // 0.6 Dialogue State Tracking - 对话状态追踪 (Moved Up)
    // =================================================================================
    const emotionObj = { label: analysis.emotion.label, score: analysis.emotion.score };
    const conversationTurn = calculateTurn(history);
    const riskSignals = analyzeRiskSignals(message);
    const dialoguePhase = inferPhase(conversationTurn, riskSignals.shouldTriggerSafetyAssessment);
    const safetyCheck = shouldTriggerSafetyCheck(riskSignals, conversationTurn, emotionObj?.score);

    // P5: 状态机驱动对话路由（优先使用，fallback 到轮次推断）
    let dialogueCtx: DialogueContext | null = null;
    let stateMachinePrompt = '';
    if (sessionId) {
      try {
        const lastAssistantMsg = await lastAssistantMsgPromise;
        dialogueCtx = restoreContext(lastAssistantMsg?.meta);
      } catch (e) {
        console.error('[StateMachine] Failed to restore context:', e);
      } finally {
        logInfo('chat-state-restore-complete', {
          sessionId,
          userId,
          stateRestoreDurationMs: Date.now() - stateRestoreStartedAt,
        });
      }
    }

    if (!dialogueCtx) {
      // 新会话或无法恢复 → 创建初始上下文，用 turn 调整初始状态
      dialogueCtx = createInitialContext();
      dialogueCtx.turn = conversationTurn;
      if (conversationTurn > 2) dialogueCtx.state = 'exploration';
    } else {
      dialogueCtx.turn = conversationTurn;
    }

    // 更新 SCEB 进度
    dialogueCtx.scebProgress = updateSCEBProgress(dialogueCtx.scebProgress, analysis, message);

    // 追踪情绪轨迹
    dialogueCtx.emotionTrajectory.push(analysis.emotion.score);
    if (dialogueCtx.emotionTrajectory.length > 20) {
      dialogueCtx.emotionTrajectory = dialogueCtx.emotionTrajectory.slice(-20);
    }

    // 练习完成消息（SFBT 触发）强制覆盖 intent，防止误判为 wrapping_up
    const isSfbtMessage = /我完成了".+"练习，现在感觉：.*\(\d+分\)/.test(message);
    if (isSfbtMessage && (analysis as any).dialogueIntent === 'wrapping_up') {
      (analysis as any).dialogueIntent = 'sharing';
      logInfo('sfbt-intent-override', { original: 'wrapping_up', corrected: 'sharing' });
    }

    // 评估状态转移
    const transition = evaluateTransition(dialogueCtx, analysis);
    if (transition.stateChanged) {
      console.log(`[StateMachine] Transition: ${dialogueCtx.state} → ${transition.nextState} (${transition.reason})`);
      dialogueCtx.state = transition.nextState;
    }

    // 生成状态机上下文注入
    stateMachinePrompt = generateStateMachinePrompt(dialogueCtx);

    logInfo('dialogue-state', {
      turn: conversationTurn,
      phase: dialoguePhase,
      machineState: dialogueCtx.state,
      riskLevel: riskSignals.level,
      triggeredSignals: riskSignals.triggeredSignals.slice(0, 3),
      shouldTriggerSafety: safetyCheck.shouldTrigger,
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

    console.log('[Groq] Quick analysis result:', analysis);
    console.log('[Safety] Assessment:', safetyData);

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
      console.log('[Exercise] Active exercise detected:', activeExercise.exerciseType, `step ${activeExercise.currentStep}/${activeExercise.totalSteps}`);
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
      memoryContextSource: typeof retrievalResult === 'string' ? 'legacy' : (retrievalResult as any)?.source,
      memoryContextDurationMs: retrievalMetrics?.totalDurationMs,
      profileMemoryQueryDurationMs: retrievalMetrics?.profileQueryDurationMs,
      sessionSummaryQueryDurationMs: retrievalMetrics?.summaryQueryDurationMs,
      routeReason: routeDecision.reason,
      triageResolved: !!softOrchestrationResult,
    });
    console.log('[API] Route decision:', { routeType, state, message: message.substring(0, 50) });
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
        providerOverride,
        modelOverride,
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
      });
    }

    // Fallback? Should cover all cases.
    await saveAssistantMessage("Unexpected error: No route matched.");
    return NextResponse.json({ error: 'Unexpected route match' }, { status: 500 });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message || 'Error processing request' }, { status: 500 });
  } finally {
    // =================================================================================
    // 异步触发记忆提取 - 不阻塞响应
    // =================================================================================
    triggerAsyncMemoryExtraction(finalSessionId, finalUserId);
  }
  }); // end runWithTrace
}
