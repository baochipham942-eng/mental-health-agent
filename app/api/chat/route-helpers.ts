import { NextResponse } from 'next/server.js';
import { StreamData } from 'ai';
import { ChatService } from '@/lib/services/chat-service';
import { generateSummary, shouldSummarize, updateConversationSummary } from '@/lib/memory/summarizer';
import {
  memoryManager,
  memoryCandidateService,
  profileMemoryMergeService,
  sessionSummaryV2Writer,
} from '@/lib/memory';
import { SKILL_CARDS, SkillType } from '@/lib/ai/skills';
import { prisma } from '@/lib/db/prisma';
import type { QuestionnaireType } from '@/lib/ai/assessment/questionnaire';
import type { QuickAnalysis } from '@/lib/ai/groq';
import type { AssessmentStage, ChatState, RouteType } from '@/types/chat';
import { analyzeRiskSignals, calculateTurn, inferPhase, shouldTriggerSafetyCheck } from '@/lib/ai/dialogue';
import {
  createInitialContext,
  restoreContext,
  evaluateTransition,
  updateSCEBProgress,
  generateStateMachinePrompt,
  type DialogueContext,
} from '@/lib/ai/dialogue/state-machine';
import { logInfo } from '@/lib/observability/logger';

const SKILL_INTRO_MESSAGES: Record<SkillType, string> = {
  breathing: '没问题，我们一起来关注呼吸，这能帮你快速平静下来。请准备好，随节奏开始：',
  meditation: '好的，找一个不受打扰的空间，让我们通过冥想找回内心的宁静。点击开始：',
  grounding: '没关系，我们先试着回到当下。请跟着这个着陆练习的指引，一步步来：',
  reframing: '当念头让你感到困扰时，换个视角或许会有新发现。试试这个认知重构练习：',
  activation: '如果感到没动力，我们先通过一个小小的行动来打破僵局。请看下面的任务卡片：',
  empty_chair: '有些话憋在心里一定很难受吧。在“空椅子”面前，你可以放心地抒发出来。准备好了吗？',
  mood_tracker: '记录和觉察是愈合的开始。我一直在这里陪着你，先来记录下你此刻最真实的感觉吧：',
  leaves_stream: '感觉思绪乱糟糟的时候，试着把它们看作溪流上的落叶。让我们开始这个练习：',
};

export function getSkillIntroMessage(skillType: SkillType): string {
  return SKILL_INTRO_MESSAGES[skillType];
}

/**
 * 创建固定字符串内容的流式响应，兼容 Vercel AI SDK data stream 协议。
 */
export function createFixedStreamResponse(content: string, data: StreamData): NextResponse {
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

/**
 * 创建带技能卡的极速响应，完全跳过 LLM。
 */
export function createSkillCardStreamResponse(
  skillType: SkillType,
  data: StreamData,
  metadata: Record<string, any>
): NextResponse {
  const skill = SKILL_CARDS[skillType];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`0:${JSON.stringify(getSkillIntroMessage(skillType))}\n`));

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

export function createAssistantMessageSaver(sessionId?: string) {
  return async (content: string, meta?: Record<string, any>) => {
    if (sessionId) {
      await ChatService.saveAssistantMessage(sessionId, content, meta);
    }
  };
}

export function scheduleConversationSummaryRefresh(params: {
  userId?: string;
  sessionId?: string;
  history: Array<{ role: string; content: string }>;
  message: string;
  assistantReply: string;
}): void {
  const { userId, sessionId, history, message, assistantReply } = params;
  if (!userId || !sessionId) return;
  if (process.env.SKIP_PRISMA_DB === '1') return;

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
        const sessionSummary = await prisma.sessionSummary.findUnique({
          where: { conversationId: sessionId },
          select: {
            emotionFinal: true,
            keyTopics: true,
            actionItems: true,
          },
        }).catch(() => null);
        await sessionSummaryV2Writer.upsert({
          userId,
          conversationId: sessionId,
          summary,
          emotionLabel: (sessionSummary?.emotionFinal as any)?.label,
          emotionScore: (sessionSummary?.emotionFinal as any)?.score,
          keyTopics: Array.isArray(sessionSummary?.keyTopics) ? sessionSummary?.keyTopics as string[] : [],
          actionItems: Array.isArray(sessionSummary?.actionItems) ? sessionSummary?.actionItems as string[] : [],
        });
        console.log('[Summarizer] Async summary refreshed.');
      }
    } catch (e) {
      console.error('[Summarizer] Async refresh failed:', e);
    }
  });
}

export function triggerAsyncMemoryExtraction(sessionId?: string, userId?: string): void {
  if (!sessionId || !userId) return;

  Promise.resolve().then(async () => {
    try {
      await memoryManager.processConversation(sessionId);
      const extracted = await memoryCandidateService.extractAndSave(sessionId);
      await profileMemoryMergeService.mergeExtractedMemories(userId, sessionId, extracted);
      console.log('[Memory] Async extraction completed for:', sessionId);
    } catch (e) {
      console.error('[Memory] Async extraction failed:', e);
    }
  });
}

export function buildLayeredMemoryContext(params: {
  baseMemoryContext?: string;
  userPreferences?: string[];
  userNickname?: string | null;
}): string {
  const sections: string[] = [];
  const base = params.baseMemoryContext?.trim();

  if (base) {
    sections.push(base);
  }

  const uniquePreferences = Array.from(
    new Set((params.userPreferences || []).map((item) => item.trim()).filter(Boolean))
  );
  if (uniquePreferences.length > 0) {
    sections.push(`## 当前偏好提醒\n${uniquePreferences.map((item) => `- ${item}`).join('\n')}`);
  }

  if (params.userNickname) {
    sections.push(`## 互动提醒\n- 用户昵称为「${params.userNickname}」，仅在自然合适的时机偶尔使用。`);
  }

  return sections.join('\n\n');
}

export function detectExplicitAssessmentRequest(message: string): boolean {
  const msg = message.trim().toLowerCase();
  // 收窄：只保留明确的评估请求，移除"做个测试"/"测试一下"等泛化词
  return [
    /做个评估/,
    /评估一下/,
    /心理评估/,
    /系统.*评估/,
    /情绪健康度/,
    /压力.*自评/,
    /压力指数/,
  ].some((pattern) => pattern.test(msg));
}

export function decideRouteByRules(params: {
  message: string;
  state?: ChatState;
  assessmentStage?: AssessmentStage;
  questionnaireType?: QuestionnaireType | null;
  explicitAssessmentRequest?: boolean;
  activeExercise?: { exerciseType?: string } | null;
  crisisCheckResult?: boolean;
}): { routeType: RouteType; reason: string } {
  const { state, assessmentStage, questionnaireType, explicitAssessmentRequest, activeExercise, crisisCheckResult } = params;

  if (activeExercise?.exerciseType) {
    return { routeType: 'support', reason: 'active_exercise' };
  }

  if (state === 'in_crisis') {
    return { routeType: 'crisis', reason: 'crisis_state' };
  }

  // crisis check 已在 prefetch 阶段并行完成
  if (crisisCheckResult) {
    return { routeType: 'crisis', reason: 'crisis_few_shot' };
  }

  if (assessmentStage === 'conclusion' || questionnaireType) {
    return { routeType: 'assessment', reason: questionnaireType ? 'questionnaire' : 'assessment_conclusion' };
  }

  if (state === 'awaiting_followup') {
    return { routeType: 'assessment', reason: 'assessment_followup' };
  }

  if (explicitAssessmentRequest) {
    return { routeType: 'assessment', reason: 'explicit_assessment_request' };
  }

  return { routeType: 'support', reason: 'main_model_default' };
}

/**
 * 对话状态追踪 — 从 route.ts 提取的自容函数
 * 计算情绪对象、对话轮次、风险信号、状态机上下文等
 */
export async function trackDialogueState(params: {
  analysis: any;
  message: string;
  history: Array<{ role: string; content: string }>;
  sessionId?: string;
  userId?: string;
  lastAssistantMsgPromise: Promise<{ meta: any } | null>;
  stateRestoreStartedAt: number;
}): Promise<{
  emotionObj: { label: string; score: number };
  conversationTurn: number;
  dialoguePhase: string;
  riskSignals: ReturnType<typeof analyzeRiskSignals>;
  safetyCheck: ReturnType<typeof shouldTriggerSafetyCheck>;
  dialogueCtx: DialogueContext;
  stateMachinePrompt: string;
}> {
  const { analysis, message, history, sessionId, userId, lastAssistantMsgPromise, stateRestoreStartedAt } = params;

  const emotionObj = { label: analysis.emotion.label, score: analysis.emotion.score };
  const conversationTurn = calculateTurn(history);
  const riskSignals = analyzeRiskSignals(message);
  const dialoguePhase = inferPhase(conversationTurn, riskSignals.shouldTriggerSafetyAssessment);
  const safetyCheck = shouldTriggerSafetyCheck(riskSignals, conversationTurn, emotionObj?.score);

  // 状态机驱动对话路由（优先使用，fallback 到轮次推断）
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
  if (isSfbtMessage && analysis.dialogueIntent === 'wrapping_up') {
    analysis.dialogueIntent = 'sharing';
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

  return { emotionObj, conversationTurn, dialoguePhase, riskSignals, safetyCheck, dialogueCtx, stateMachinePrompt };
}

export function buildFallbackQuickAnalysis(params: {
  crisisCheckResult: boolean;
}): QuickAnalysis {
  const crisis = params.crisisCheckResult;

  return {
    safety: crisis ? 'crisis' : 'normal',
    safetyReasoning: crisis ? 'few-shot 语义检测到危机表达' : 'triage 未及时返回，使用最小安全兜底',
    stateReasoning: '普通消息默认交给主模型直接回应',
    emotion: { label: crisis ? '恐惧' : '未表达', score: crisis ? 9 : 0 },
    route: crisis ? 'crisis' : 'support',
    needsValidation: false,
    adaptiveMode: crisis ? 'guardian' : 'companion',
    personaReasoning: crisis ? '危机状态优先稳定化' : '默认陪伴式回应',
    memoryCheck: '待主模型在回复后由 memory v2 异步提取',
    dialogueIntent: crisis ? 'sharing' : 'opening',
  };
}
