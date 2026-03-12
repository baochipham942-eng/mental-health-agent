import { NextRequest, NextResponse } from 'next/server';
import { StreamData } from 'ai';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { QuickAnalysis } from '@/lib/ai/groq';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import { continueAssessment, streamAssessmentReply } from '@/lib/ai/assessment';
import { deepseek, streamEFTValidationReply } from '@/lib/ai/deepseek';
import { streamAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { generateSFBTQuery } from '@/lib/ai/sfbt';
import { quickCrisisKeywordCheck } from '@/lib/ai/crisis-classifier';
import { ChatRequest, RouteType } from '@/types/chat';
import { memoryManager } from '@/lib/memory';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import { logInfo, logWarn, logError } from '@/lib/observability/logger';
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
import { generateSummary, shouldSummarize, updateConversationSummary } from '@/lib/memory/summarizer';
import { analyzeConversationForStuckLoop, createStuckLoopEvent } from '@/lib/ai/detection/stuck-loop';
import { ChatService } from '@/lib/services/chat-service';
import { determinePersonaMode, AdaptiveMode } from '@/lib/ai/persona-manager';
// P1: Agent 编排升级
import { orchestrate, triggerQualityCheck } from '@/lib/ai/agents/orchestrator';
// P0-B: 练习引擎
import { isGuidedExercise, buildExerciseSystemInjection } from '@/lib/ai/exercise-engine';
// P2-B: 危机升级
import { createCrisisEscalation } from '@/lib/ai/crisis-escalation';

/**
 * 辅助函数：创建固定字符串内容的流式响应
 * 模拟 Vercel AI SDK 协议: 0:"text"\nd:{...}\n
 */
function createFixedStreamResponse(content: string, data: StreamData): NextResponse {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`0:${JSON.stringify(content)}\n`));
      data.close();
      const reader = data.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (e) {
        console.error('Error reading data stream', e);
      }
      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
    },
  });
}

// =================================================================================
// 预设技能卡配置 - 用于直接技能请求的快速响应
// =================================================================================
// 导出用于测试
import { SKILL_CARDS, SkillType, detectDirectSkillRequest } from '@/lib/ai/skills';

// =================================================================================
// 预设技能卡配置 - 用于直接技能请求的快速响应
// =================================================================================
// 逻辑已移至 @/lib/ai/skills.ts 以避免 Route Handler 导出类型错误

/**
 * 创建带技能卡的快速流式响应（跳过 DeepSeek）
 */
function createSkillCardStreamResponse(
  skillType: SkillType,
  data: StreamData,
  metadata: Record<string, any>
): NextResponse {
  const skill = SKILL_CARDS[skillType];
  const introMessages: Record<SkillType, string> = {
    breathing: '没问题，我们一起来关注呼吸，这能帮你快速平静下来。请准备好，随节奏开始：',
    meditation: '好的，找一个不受打扰的空间，让我们通过冥想找回内心的宁静。点击开始：',
    grounding: '没关系，我们先试着回到当下。请跟着这个着陆练习的指引，一步步来：',
    reframing: '当念头让你感到困扰时，换个视角或许会有新发现。试试这个认知重构练习：',
    activation: '如果感到没动力，我们先通过一个小小的行动来打破僵局。请看下面的任务卡片：',
    empty_chair: '有些话憋在心里一定很难受吧。在“空椅子”面前，你可以放心地抒发出来。准备好了吗？',
    mood_tracker: '记录和觉察是愈合的开始。我一直在这里陪着你，先来记录下你此刻最真实的感觉吧：',
    leaves_stream: '感觉思绪乱糟糟的时候，试着把它们看作溪流上的落叶。让我们开始这个练习：',
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 1. 先输出简短文字
      const intro = introMessages[skillType];
      controller.enqueue(encoder.encode(`0:${JSON.stringify(intro)}\n`));

      // 2. 添加元数据（包含 actionCards）
      data.append({
        ...metadata,
        routeType: 'support',
        actionCards: [skill],
        fastSkillResponse: true,
      } as any);

      data.close();
      const reader = data.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (e) {
        console.error('Error reading data stream', e);
      }
      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
    },
  });
}


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let finalSessionId: string | undefined;
  let finalUserId: string | undefined;
  let routeType: RouteType = 'support';
  const data = new StreamData();
  const requestStartedAt = Date.now();

  try {
    const body: ChatRequest = await request.json();
    const { message, history = [], state, assessmentStage, meta } = body;
    // data is already declared outside or at the start of POST.
    // Actually, I'll declare it here inside the try block to ensure it's available for all catch/finally.

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
      const introMessages: Record<SkillType, string> = {
        breathing: '没问题，我们一起来关注呼吸，这能帮你快速平静下来。请准备好，随节奏开始：',
        meditation: '好的，找一个不受打扰的空间，让我们通过冥想找回内心的宁静。点击开始：',
        grounding: '没关系，我们先试着回到当下。请跟着这个着陆练习的指引，一步步来：',
        reframing: '当念头让你感到困扰时，换个视角或许会有新发现。试试这个认知重构练习：',
        activation: '如果感到没动力，我们先通过一个小小的行动来打破僵局。请看下面的任务卡片：',
        empty_chair: '有些话憋在心里一定很难受吧。在“空椅子”面前，你可以放心地抒发出来。准备好了吗？',
        mood_tracker: '记录和觉察是愈合的开始。我一直在这里陪着你，先来记录下你此刻最真实的感觉吧：',
        leaves_stream: '感觉思绪乱糟糟的时候，试着把它们看作溪流上的落叶。让我们开始这个练习：',
      };

      // 异步保存消息（不阻塞）
      if (body.sessionId) {
        ChatService.saveAssistantMessage(body.sessionId, introMessages[directSkillType], {
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

    // Import helper dynamically or at top? Top is better but for this refactor we assume top import added.
    // We will add the import in a separate block or assume it's available.
    // Wait, I need to add the import first.

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

    // Helper wrapper to match previous usage
    const saveAssistantMessage = async (content: string, meta?: Record<string, any>) => {
      if (sessionId) {
        await ChatService.saveAssistantMessage(sessionId, content, meta);
      }
    };

    const scheduleConversationSummaryRefresh = (assistantReply: string) => {
      if (!userId || !sessionId) return;

      const summaryHistory = [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content: assistantReply },
      ];

      if (!shouldSummarize(summaryHistory.length)) return;

      Promise.resolve().then(async () => {
        try {
          console.log('[Summarizer] Refreshing conversation summary asynchronously...');
          const summary = await generateSummary(summaryHistory);
          if (summary) {
            await updateConversationSummary(sessionId, summary);
            console.log('[Summarizer] Async summary refreshed.');
          }
        } catch (e) {
          console.error('[Summarizer] Async refresh failed:', e);
        }
      });
    };

    // =================================================================================
    // 0.5 Memory Retrieval + Groq Analysis (并行执行，节省 ~300ms)
    // =================================================================================
    let memoryContext = '';
    let processedHistory = history;

    // 并行执行：Agent 编排（Triage+Safety） + 记忆检索
    // 传入最近2条历史记录作为上下文，帮助 Triage Agent 判断意图
    const prefetchStartedAt = Date.now();
    const recentContext = history.slice(-2);
    const orchestratePromise = orchestrate({
      message,
      history: history as any,
      recentHistory: recentContext,
    });

    const memoryPromise = (userId && history.length > 0)
      ? (async () => {
        try {
          // 阶段3：获取包含原始记忆数组的完整记忆对象
          return await memoryManager.getMemoriesForContext(userId, message);
        } catch (e) {
          console.error('[Memory] Failed:', e);
        }
        return { contextString: '', memories: [] };
      })()
      : Promise.resolve({ contextString: '', memories: [] });

    // 同时等待两个结果 (Groq 现在包含 safety reasoning)
    // Add Promise for Assessment History logic
    const assessmentPromise = (userId)
      ? prisma.assessmentReport.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5
      }).catch(e => [])
      : Promise.resolve([]);

    // Add Promise for Global Preferences
    const preferencePromise = (userId)
      ? prisma.userMemory.findMany({
        where: {
          userId,
          topic: { in: ['communication_style', 'coping_preference'] }
        },
        orderBy: { accessedAt: 'desc' },
        take: 5
      }).catch(e => [])
      : Promise.resolve([]);

    // P5: 获取用户治疗师偏好
    const therapistPromise = (userId)
      ? prisma.user.findUnique({
        where: { id: userId },
        select: { preferredTherapist: true }
      }).catch(e => null)
      : Promise.resolve(null);

    const activeExercisePromise = (userId)
      ? prisma.exerciseState.findFirst({
        where: { userId, status: 'in_progress' },
        orderBy: { updatedAt: 'desc' },
      }).catch(e => null)
      : Promise.resolve(null);

    const [orchestrationResult, retrievalResult, assessmentHistory, preferenceMemories, userTherapistPref, activeExercise] = await Promise.all([orchestratePromise, memoryPromise, assessmentPromise, preferencePromise, therapistPromise, activeExercisePromise]);
    const prefetchDurationMs = Date.now() - prefetchStartedAt;
    logInfo('chat-prefetch-complete', {
      sessionId,
      userId,
      prefetchDurationMs,
      historyLen: history.length,
      hasActiveExercise: !!activeExercise,
      preferenceCount: preferenceMemories.length,
      assessmentCount: assessmentHistory.length,
    });

    // 从编排结果中解包 Triage + Safety
    const analysis = orchestrationResult.triage.data;
    const safetyAgentResult = orchestrationResult.safety;

    const userPreferences = preferenceMemories.map((m: any) => m.content);

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
      memoryContext = retrievalResult.contextString || '';
      // 阶段3 主动推送：将相关记忆注入数据流
      if (retrievalResult.memories?.length > 0) {
        data.append({
          timestamp: new Date().toISOString(),
          relevantMemories: retrievalResult.memories.map((m: any) => ({
            id: m.id,
            content: m.content,
            topic: m.topic,
            sourceConvId: m.sourceConvId
          }))
        } as any);
      }
    }

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
      const stateRestoreStartedAt = Date.now();
      try {
        // 尝试从最后一条 assistant 消息的 meta 中恢复状态机上下文
        const lastAssistantMsg = await prisma.message.findFirst({
          where: { conversationId: sessionId, role: 'assistant' },
          orderBy: { createdAt: 'desc' },
          select: { meta: true },
        });
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

    // 评估状态转移
    const transition = evaluateTransition(dialogueCtx, analysis);
    if (transition.stateChanged) {
      console.log(`[StateMachine] Transition: ${dialogueCtx.state} → ${transition.nextState} (${transition.reason})`);
      dialogueCtx.state = transition.nextState;
    }

    // 生成状态机上下文注入
    stateMachinePrompt = generateStateMachinePrompt(dialogueCtx);

    // P5: 检测问卷触发请求
    // TODO: 当检测到用户连续 3+ 次对话涉及同类情绪话题时，
    // AI 温和建议"要不要花几分钟了解一下自己最近的状态？"
    // 用户仍可主动触发（说"了解一下自己"/"测一下"）
    const questionnaireType = detectQuestionnaireRequest(message);
    if (questionnaireType) {
      logInfo('questionnaire-trigger', { type: questionnaireType, source: 'user_request' });
    }

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
      route: analysis.route,
    };

    // 构建角色与记忆元数据
    const personaData = {
      mode: analysis.adaptiveMode || adaptiveMode,
      reasoning: analysis.personaReasoning || '根据对话上下文动态调整',
    };

    const memoryData = {
      check: analysis.memoryCheck || '无',
      retrieved: typeof retrievalResult !== 'string' && retrievalResult.memories?.length > 0
        ? retrievalResult.memories.map((m: any) => m.topic).join(', ')
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
    } as any);

    // 如果 Groq 检测到危机，强制切换到危机路由
    if (analysis.safety === 'crisis') {
      console.log('[API] Groq detected crisis, overriding route');
      routeType = 'crisis';
    }

    // =================================================================================
    // 0.55 User Context Injection - 将用户昵称注入上下文，让 AI 可以自然使用
    // =================================================================================
    const userNickname = session?.user?.nickname;
    if (userNickname) {
      memoryContext += `\n\n**用户信息**：用户昵称为「${userNickname}」。你可以在合适的时机（如开场问候、鼓励语句）使用这个昵称来增加亲切感，但不要每句都用，保持自然。`;
    }

    // const data = new StreamData(); // Moved up
    const traceMetadata = { sessionId, userId };

    routeType = analysis.route;

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

    // 后备：关键词检测危机（防止小模型漏检）
    if (routeType !== 'crisis' && quickCrisisKeywordCheck(message)) {
      console.log('[API] Crisis keyword detected, overriding route');
      routeType = 'crisis';
    }

    // 移除原有硬编码的关键词强制路由逻辑，改由 Groq 分析意图



    // Fix: Sticky Logic Removed
    // Previously we forced 'assessment' if state was 'awaiting_followup'.
    // Now we trust Groq's context-aware routing.
    // However, if the route IS 'assessment' and we are 'awaiting_followup', that's fine.
    // If Groq says 'support' but we are 'awaiting_followup' -> user likely changed topic -> We respect 'support'.


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
    });
    console.log('[API] Route decision:', { routeType, state, message: message.substring(0, 50) });
    if (state === 'in_crisis' || routeType === 'crisis') {
      // 退出机制：
      // 1. 显式的安全声明 (正则)
      // 2. Groq 安全分析也认为是 'normal' (双重确认)
      const isExplicitSafety = /我没事了|感觉好多了|已经不处在危险中了|放心吧|删除.*记忆|不聊了|换个话题/.test(message);
      const isAnalysedSafe = safetyData.label === 'normal';

      if (state === 'in_crisis' && (isExplicitSafety || isAnalysedSafe)) {
        console.log('[API] De-escalating crisis state based on validation:', { isExplicitSafety, isAnalysedSafe });
        // De-escalate
        data.append({ timestamp: new Date().toISOString(), routeType: 'support', state: 'normal', emotion: null });

        const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
          // Non-blocking save
          saveAssistantMessage(text, {
            toolCalls,
            safety: safetyData,
            state: stateData,
          }).catch(e => console.error('[DB] Failed to save assistant message:', e));
          scheduleConversationSummaryRefresh(text);
          logInfo('chat-response-finished', {
            sessionId,
            userId,
            routeType: 'support',
            totalDurationMs: Date.now() - requestStartedAt,
            responseLength: text.length,
          });

          // CRITICAL FIX: Ensure full reply is in the data stream final packet
          data.append({
            reply: text,
            toolCalls,
            safety: safetyData,
          } as any);
          data.close();
        };

        const result = await streamSupportReply(message, history, { onFinish: onFinishWithMeta, traceMetadata });
        return result.toDataStreamResponse({ data });
      }

      data.append({ timestamp: new Date().toISOString(), routeType: 'crisis', state: 'in_crisis', emotion: emotionObj });

      // P2-B: 创建危机升级记录 + Telegram 通知（fire-and-forget）
      if (userId && sessionId) {
        createCrisisEscalation({
          userId,
          conversationId: sessionId,
          triggerMessage: message,
          riskLevel: analysis.safety === 'crisis' ? 'crisis' : 'urgent',
          safetyScore: safetyData.score,
        }).catch(e => console.error('[CrisisEscalation] Failed:', e));
      }

      const onCrisisFinish = async (text: string, toolCalls?: any[]) => {
        // Non-blocking save
        saveAssistantMessage(text, {
          toolCalls,
          safety: safetyData,
          state: stateData,
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));
        scheduleConversationSummaryRefresh(text);
        logInfo('chat-response-finished', {
          sessionId,
          userId,
          routeType: 'crisis',
          totalDurationMs: Date.now() - requestStartedAt,
          responseLength: text.length,
        });

        data.append({
          reply: text,
          toolCalls,
          safety: safetyData,
        } as any);
        data.close();

        // P1: 异步质检
        if (sessionId) {
          triggerQualityCheck({
            conversationId: sessionId,
            routeType: 'crisis',
            adaptiveMode: 'guardian',
            safetyLevel: safetyData.label,
            reply: text,
            userMessage: message,
          });
        }
      }

      const result = await streamCrisisReply(message, history, state === 'in_crisis', { onFinish: onCrisisFinish, traceMetadata });
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 1.5 EFT Validation Logic - (The "Heart" Phase)
    // 优先处理高情绪唤起 (非危机状态下)
    // =================================================================================
    if (analysis.needsValidation) {
      console.log('[API] EFT Validation triggered (High Emotion Score)');

      const onFinishWithMeta = async (text: string) => {
        // Non-blocking save
        saveAssistantMessage(text, {
          routeType: 'support',
          subRoute: 'eft_validation',
          safety: safetyData,
          state: stateData
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));
        scheduleConversationSummaryRefresh(text);
        logInfo('chat-response-finished', {
          sessionId,
          userId,
          routeType: 'support',
          subRoute: 'eft_validation',
          totalDurationMs: Date.now() - requestStartedAt,
          responseLength: text.length,
        });

        data.append({
          reply: text,
          routeType: 'support',
          safety: safetyData,
          isEFT: true
        } as any);
        data.close();
      };

      const result = await streamEFTValidationReply(message, processedHistory, {
        onFinish: onFinishWithMeta,
        traceMetadata
      });
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 2. 支持处理 (Support Handler) - 积极/倾诉/中性
    // =================================================================================
    if (routeType === 'support') {
      // SFBT Logic Detection
      // SFBT Logic Detection
      let sfbtInstruction = undefined;
      // Match: "我完成了“五感着陆”练习，现在感觉：🙂 (4分)"
      // Matches the format sent by ActionCardItem
      const sfbtMatch = message.match(/我完成了“(.+)”练习，现在感觉：.*\((\d+)分\)/);
      if (sfbtMatch) {
        const [_, exerciseName, scoreStr] = sfbtMatch;
        const postScore = parseInt(scoreStr);
        // preScore is unknown, so we rely on absolute postScore logic
        sfbtInstruction = generateSFBTQuery({ postScore, exerciseName });
        logInfo('sfbt-trigger', { exerciseName, postScore });
      }

      // 移除手动注入 actionCards 的逻辑，改由 LLM 通过工具调用 (support.ts) 自主推荐，
      // 从而确保推荐前会有共情话术。
      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'support',
        state: 'normal',
        emotion: emotionObj,
      });

      const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
        // Non-blocking save (include dialogueContext for state machine persistence)
        saveAssistantMessage(text, {
          toolCalls,
          safety: safetyData,
          state: stateData,
          adaptiveMode, // Persist mode for Feedback Loop
          dialogueContext: dialogueCtx, // P5: 状态机上下文持久化
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));
        scheduleConversationSummaryRefresh(text);
        logInfo('chat-response-finished', {
          sessionId,
          userId,
          routeType: 'support',
          totalDurationMs: Date.now() - requestStartedAt,
          responseLength: text.length,
        });

        data.append({
          reply: text,
          toolCalls,
          safety: safetyData,
        } as any);
        data.close();

        // P1: 异步质检（不阻塞）
        if (sessionId) {
          triggerQualityCheck({
            conversationId: sessionId,
            routeType: 'support',
            adaptiveMode,
            safetyLevel: safetyData.label,
            reply: text,
            userMessage: message,
          });
        }
      };

      // 合并注入：SFBT + 练习引导 + 安全约束 + 状态机
      let combinedInjection = sfbtInstruction || '';
      if (exerciseInjection) combinedInjection += exerciseInjection;
      if (stateMachinePrompt) combinedInjection += stateMachinePrompt;
      if (safetyData.constraints && safetyData.constraints.length > 0) {
        combinedInjection += `\n\n**安全约束（必须遵守）**：\n${safetyData.constraints.map((c: string) => `- ${c}`).join('\n')}`;
      }

      const result = await streamSupportReply(message, processedHistory, {
        onFinish: onFinishWithMeta,
        traceMetadata,
        memoryContext,
        systemInstructionInjection: combinedInjection || undefined,
        adaptiveMode,
        therapistId: userTherapistPref?.preferredTherapist || undefined,
        userPreferences // Pass extracted preferences
      });
      // data.close() moved to onFinish
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 3. 评估处理 (Assessment Handler) - 收集循环 -> 结论
    // =================================================================================
    if (routeType === 'assessment') {
      // 移除 assessment 路由下的硬编码技能快捷路径

      // Call Assessment Loop with State Classifier (Streaming Version)
      const onAssessmentFinish = async (text: string, toolCalls?: any[]) => {
        // Determine if it's a conclusion based on tool calls
        const isConclusion = toolCalls?.some(tc => tc.function.name === 'finish_assessment') || false;

        // Non-blocking save
        saveAssistantMessage(text, {
          toolCalls,
          routeType: 'assessment',
          assessmentStage: isConclusion ? 'conclusion' : 'intake',
          safety: safetyData,
          state: stateData,
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));
        scheduleConversationSummaryRefresh(text);
        logInfo('chat-response-finished', {
          sessionId,
          userId,
          routeType: 'assessment',
          assessmentStage: isConclusion ? 'conclusion' : 'intake',
          totalDurationMs: Date.now() - requestStartedAt,
          responseLength: text.length,
        });

        // 🔄 异步检测死循环（不阻塞响应）
        if (!isConclusion && sessionId) {
          analyzeConversationForStuckLoop(sessionId).then(result => {
            if (result?.isStuck) {
              createStuckLoopEvent(sessionId, result);
            }
          }).catch(err => console.error('[StuckLoop] Detection failed:', err));
        }

        data.append({
          reply: text,
          toolCalls,
          routeType: 'assessment',
          assessmentStage: isConclusion ? 'conclusion' : 'intake',
          safety: safetyData,
        } as any);
        data.close();

        // P1: 异步质检
        if (sessionId) {
          triggerQualityCheck({
            conversationId: sessionId,
            routeType: 'assessment',
            adaptiveMode,
            safetyLevel: safetyData.label,
            reply: text,
            userMessage: message,
          });
        }
      };

      // 🔄 Special Case: If we are already in conclusion stage OR the classifier says we should conclude
      if (assessmentStage === 'conclusion') {
        const allUserMessages = history.filter(m => m.role === 'user').map(m => m.content);
        allUserMessages.push(message);
        const initialMsg = allUserMessages[0] || message;
        const followupStr = allUserMessages.slice(1).join('\n\n') || '（无补充回答）';

        const onConclusionFinish = async (text: string, actionCards: any[]) => {
          // Non-blocking save
          saveAssistantMessage(text, {
            routeType: 'assessment',
            assessmentStage: 'conclusion',
            actionCards,
          }).catch(e => console.error('[DB] Failed to save assistant message:', e));
          scheduleConversationSummaryRefresh(text);
          logInfo('chat-response-finished', {
            sessionId,
            userId,
            routeType: 'assessment',
            assessmentStage: 'conclusion',
            totalDurationMs: Date.now() - requestStartedAt,
            responseLength: text.length,
          });

          data.append({
            reply: text,
            actionCards,
            routeType: 'assessment',
            assessmentStage: 'conclusion',
            safety: safetyData,
          } as any);
          data.close();
        };

        const conclusionResult = await streamAssessmentConclusion(initialMsg, followupStr, history, {
          traceMetadata,
          onFinish: onConclusionFinish
        });
        return conclusionResult.toDataStreamResponse({ data });
      }

      const assessmentResult = await streamAssessmentReply(message, processedHistory, {
        traceMetadata,
        memoryContext,
        onFinish: onAssessmentFinish
      });

      // Check if conclusion is needed (Dynamic)
      // Note: True streaming assessment means we might need to handle conclusion transition 
      // differently if we want to stream the conclusion REPORT immediately.
      // For now, keep it simple: Intake streams, then client sends another msg or tool triggers it.

      // If we are already heading for a conclusion (State classifier previously said so)
      // we might want to skip intake streaming and go straight to conclusion streaming.
      // But classifyDialogueState is currently non-streaming.

      return assessmentResult.toDataStreamResponse({ data });
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
    // Session and userId are captured at the start of the try block
    if (finalSessionId && finalUserId) {
      const sessionId = finalSessionId;
      // 使用 setImmediate 模拟或直接在 finally 中异步执行
      Promise.resolve().then(async () => {
        try {
          await memoryManager.processConversation(sessionId);
          console.log('[Memory] Async extraction completed for:', sessionId);
        } catch (e) {
          console.error('[Memory] Async extraction failed:', e);
        }
      });
    }
  }
}
