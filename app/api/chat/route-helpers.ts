import { after } from 'next/server';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { ChatUIMessage, ChatUIChunk } from '@/types/chat-ui-message';
import { ChatService } from '@/lib/services/chat-service';
import { generateSummary, shouldSummarize, updateConversationSummary } from '@/lib/memory/summarizer';
import {
  memoryCandidateService,
  profileMemoryMergeService,
} from '@/lib/memory';
import { SKILL_CARDS, SkillType } from '@/lib/ai/skills';
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
import { logInfo, logError } from '@/lib/observability/logger';

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
 * 写一段固定文本到 UIMessageStream writer
 * （v6 没有 sendText helper，手动构造 text-start + text-delta + text-end 三个 chunk）
 */
function writeFixedText(
  writer: { write: (chunk: any) => void },
  content: string,
  textId: string = 'fixed-text',
): void {
  writer.write({ type: 'text-start', id: textId });
  writer.write({ type: 'text-delta', id: textId, delta: content });
  writer.write({ type: 'text-end', id: textId });
}

/**
 * 创建固定字符串内容的流式响应（input guard 阻断时用）
 */
export function createFixedStreamResponse(
  content: string,
  preludeParts: ChatUIChunk[] = [],
): Response {
  const stream = createUIMessageStream<ChatUIMessage>({
    execute: ({ writer }) => {
      for (const part of preludeParts) writer.write(part);
      writeFixedText(writer, content);
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * 创建带技能卡的极速响应，完全跳过 LLM
 */
export function createSkillCardStreamResponse(
  skillType: SkillType,
  metadata: {
    emotion?: { label: string; score: number };
    safety?: { label: string; score: number; reasoning: string; constraints: string[] };
  },
): Response {
  const skill = SKILL_CARDS[skillType];
  const intro = getSkillIntroMessage(skillType);

  const stream = createUIMessageStream<ChatUIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: 'data-route', data: { routeType: 'support' } });
      if (metadata.emotion) {
        writer.write({ type: 'data-emotion', data: metadata.emotion });
      }
      if (metadata.safety) {
        writer.write({ type: 'data-safety', data: metadata.safety });
      }
      writer.write({ type: 'data-action-cards', data: { cards: [skill] } });
      writeFixedText(writer, intro);
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export function createAssistantMessageSaver(sessionId?: string) {
  return async (content: string, meta?: Record<string, any>) => {
    if (sessionId) {
      await ChatService.saveAssistantMessage(sessionId, content, meta);
    }
  };
}

/**
 * 把"响应返回后"的后台任务交给 next/server 的 after()。
 *
 * 旧实现用裸 Promise.resolve().then()：本地长驻 Node 能跑完，但在 Vercel / 阿里云 FC 等
 * serverless 环境下，响应流结束后实例可能被立刻冻结，导致后台任务（含数秒级 LLM 调用）半路被掐。
 * after() 会让运行时等待任务完成后再回收实例。
 *
 * 兜底：若调用点不在 request scope（after 抛错），回退到原 fire-and-forget，绝不影响主链路。
 */
function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
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

  runAfterResponse(async () => {
    try {
      logInfo('summarizer-refresh-start', { sessionId });
      const summary = await generateSummary(summaryHistory);
      if (summary) {
        // updateConversationSummary 内部已处理 V2 upsert + progress metrics
        await updateConversationSummary(sessionId, summary);
        logInfo('summarizer-refresh-done', { sessionId });
      }
    } catch (e: any) {
      logError('summarizer-refresh-failed', { sessionId, error: e?.message });
    }
  });
}

export function triggerAsyncMemoryExtraction(sessionId?: string, userId?: string): void {
  if (!sessionId || !userId) return;

  runAfterResponse(async () => {
    try {
      const extracted = await memoryCandidateService.extractAndSave(sessionId);
      await profileMemoryMergeService.mergeExtractedMemories(userId, sessionId, extracted);
      logInfo('memory-extraction-done', { sessionId });
    } catch (e: any) {
      logError('memory-extraction-failed', { sessionId, error: e?.message });
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
  analysis: QuickAnalysis;
  message: string;
  history: Array<{ role: string; content: string }>;
  sessionId?: string;
  userId?: string;
  lastAssistantMsgPromise: Promise<{ meta: unknown } | null>;
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
    logInfo('state-machine-transition', { from: dialogueCtx.state, to: transition.nextState, reason: transition.reason });
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
