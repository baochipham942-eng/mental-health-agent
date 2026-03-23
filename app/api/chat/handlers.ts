import type { StreamData } from 'ai';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import type { LlmProviderName } from '@/lib/llm';
import { streamAssessmentReply } from '@/lib/ai/assessment';
import { streamAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { generateSFBTQuery } from '@/lib/ai/sfbt';
import { analyzeConversationForStuckLoop, createStuckLoopEvent } from '@/lib/ai/detection/stuck-loop';
import { triggerQualityCheck } from '@/lib/ai/agents/orchestrator';
import { createCrisisEscalation } from '@/lib/ai/crisis-escalation';
import { assessCrisisDeescalation } from '@/lib/ai/crisis-classifier';
import { logInfo, logWarn } from '@/lib/observability/logger';
import { guardOutput } from '@/lib/ai/guardrails/output-guard';
import { trackFunnel } from '@/lib/observability/funnel';
import { recordMetric } from '@/lib/ai/progress/tracker';
import type { DialogueContext } from '@/lib/ai/dialogue/state-machine';
import type { AdaptiveMode } from '@/lib/ai/persona-manager';

type SaveAssistantMessage = (content: string, meta?: Record<string, any>) => Promise<void>;
type RefreshSummary = (params: {
  userId?: string;
  sessionId?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  assistantReply: string;
}) => void;

interface BaseHandlerParams {
  data: StreamData;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  processedHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionId?: string;
  userId?: string;
  traceMetadata: Record<string, any>;
  requestStartedAt: number;
  saveAssistantMessage: SaveAssistantMessage;
  scheduleConversationSummaryRefresh: RefreshSummary;
  safetyData: any;
  stateData: any;
  adaptiveMode: AdaptiveMode;
  agentTrace?: any[];
}

/**
 * onFinish 回调工厂 — 统一处理 save/refresh/log/stream-close/quality-check
 */
function createOnFinishCallback(params: {
  data: StreamData;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionId?: string;
  userId?: string;
  requestStartedAt: number;
  saveAssistantMessage: SaveAssistantMessage;
  scheduleConversationSummaryRefresh: RefreshSummary;
  safetyData: any;
  routeType: string;
  adaptiveMode: AdaptiveMode;
  /** 额外的 meta 字段合并到 saveAssistantMessage */
  extraMeta?: Record<string, any>;
  /** onFinish 后的额外逻辑（如 stuckLoop 检测） */
  afterFinish?: (text: string, toolCalls?: any[]) => void;
  /** 是否跳过质检 */
  skipQualityCheck?: boolean;
  /** 额外的 stream append 字段 */
  extraStreamData?: Record<string, any>;
}) {
  const {
    data, message, history, sessionId, userId, requestStartedAt,
    saveAssistantMessage, scheduleConversationSummaryRefresh,
    safetyData, routeType, adaptiveMode,
    extraMeta, afterFinish, skipQualityCheck, extraStreamData,
  } = params;

  return async (text: string, toolCalls?: any[]) => {
    // Output guard — 检测有害内容/PII/系统泄露
    const guardResult = guardOutput(text);
    const safeText = guardResult.safe ? text : guardResult.redactedResponse;
    if (!guardResult.safe) {
      logWarn('output-guard-triggered', {
        issues: guardResult.issues,
        sessionId,
        routeType,
      });
    }

    saveAssistantMessage(safeText, {
      toolCalls,
      safety: safetyData,
      ...extraMeta,
    }).catch(e => logWarn('db-save-failed', { error: String(e) }));

    scheduleConversationSummaryRefresh({ userId, sessionId, history, message, assistantReply: safeText });

    logInfo('chat-response-finished', {
      sessionId, userId, routeType,
      totalDurationMs: Date.now() - requestStartedAt,
      responseLength: safeText.length,
    });

    data.append({
      reply: safeText,
      toolCalls,
      safety: safetyData,
      guardResult: {
        safe: guardResult.safe,
        issues: guardResult.issues,
      },
      ...extraStreamData,
    } as any);
    data.close();

    if (!skipQualityCheck && sessionId) {
      triggerQualityCheck({
        conversationId: sessionId,
        routeType,
        adaptiveMode,
        safetyLevel: safetyData.label,
        reply: text,
        userMessage: message,
      });
    }

    // 漏斗埋点：检测技能推荐
    if (toolCalls?.some((tc: any) => tc.function?.name === 'recommend_skill_card' || tc.toolName === 'recommend_skill_card')) {
      const skillCall = toolCalls.find((tc: any) => tc.function?.name === 'recommend_skill_card' || tc.toolName === 'recommend_skill_card');
      const skillType = skillCall?.function?.arguments ? JSON.parse(skillCall.function.arguments)?.widget : undefined;
      trackFunnel('l1_skill_recommended', { userId, sessionId, skillType }).catch(() => {});
    }

    afterFinish?.(text, toolCalls);
  };
}

function withStreamMetrics(
  response: Response,
  params: {
    sessionId?: string;
    userId?: string;
    routeType: string;
    requestStartedAt: number;
    traceMetadata?: Record<string, any>;
  }
): Response {
  if (!response.body) return response;

  let firstChunkLogged = false;
  const { sessionId, userId, routeType, requestStartedAt, traceMetadata } = params;

  const stream = new ReadableStream({
    start(controller) {
      const reader = response.body!.getReader();

      const pump = (): void => {
        reader.read()
          .then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }

            if (!firstChunkLogged) {
              firstChunkLogged = true;
              logInfo('chat-first-token', {
                sessionId,
                userId,
                routeType,
                llmFirstTokenMs: Date.now() - requestStartedAt,
                ...traceMetadata,
              });
            }

            controller.enqueue(value);
            pump();
          })
          .catch((error) => {
            controller.error(error);
          });
      };

      pump();
    },
    cancel(reason) {
      return response.body?.cancel(reason);
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function handleCrisisRoute(params: BaseHandlerParams & {
  state?: string;
  emotionObj: { label: string; score: number };
  analysis: { safety: string };
}): Promise<Response> {
  const {
    data,
    message,
    history,
    sessionId,
    userId,
    traceMetadata,
    requestStartedAt,
    saveAssistantMessage,
    scheduleConversationSummaryRefresh,
    safetyData,
    stateData,
    adaptiveMode,
    analysis,
    state,
    emotionObj,
    agentTrace,
  } = params;

  const isAnalysedSafe = safetyData.label === 'normal';

  // LLM 语义评估是否真正脱离危机（替代硬编码正则）
  let isDeescalated = false;
  if (state === 'in_crisis' && isAnalysedSafe) {
    const deescalation = await assessCrisisDeescalation(message, history);
    isDeescalated = deescalation.isSafe;
    logInfo('crisis-deescalation-check', {
      sessionId, userId,
      isSafe: deescalation.isSafe,
      confidence: deescalation.confidence,
      reason: deescalation.reason,
      safetyLabel: safetyData.label,
    });
  }

  if (state === 'in_crisis' && isDeescalated) {
    logInfo('crisis-deescalation', { sessionId, userId });
    data.append({ timestamp: new Date().toISOString(), routeType: 'support', state: 'normal', emotion: null });

    const onDeescalateFinish = createOnFinishCallback({
      data, message, history, sessionId, userId, requestStartedAt,
      saveAssistantMessage, scheduleConversationSummaryRefresh,
      safetyData, routeType: 'support', adaptiveMode,
      extraMeta: { state: stateData, agentTrace },
      skipQualityCheck: true,
    });

    const result = await streamSupportReply(message, history, { onFinish: onDeescalateFinish, traceMetadata });
    return withStreamMetrics(result.toDataStreamResponse({ data }), {
      sessionId,
      userId,
      routeType: 'support',
      requestStartedAt,
      traceMetadata,
    });
  }

  data.append({ timestamp: new Date().toISOString(), routeType: 'crisis', state: 'in_crisis', emotion: emotionObj });

  if (userId && sessionId) {
    createCrisisEscalation({
      userId,
      conversationId: sessionId,
      triggerMessage: message,
      riskLevel: analysis.safety === 'crisis' ? 'crisis' : 'urgent',
      safetyScore: safetyData.score,
    }).catch(e => console.error('[CrisisEscalation] Failed:', e));
  }

  const onCrisisFinish = createOnFinishCallback({
    data, message, history, sessionId, userId, requestStartedAt,
    saveAssistantMessage, scheduleConversationSummaryRefresh,
    safetyData, routeType: 'crisis', adaptiveMode: 'guardian',
    extraMeta: { state: stateData, agentTrace },
  });

  const result = await streamCrisisReply(message, history, state === 'in_crisis', { onFinish: onCrisisFinish, traceMetadata });
  return withStreamMetrics(result.toDataStreamResponse({ data }), {
    sessionId,
    userId,
    routeType: 'crisis',
    requestStartedAt,
    traceMetadata,
  });
}

export async function handleSupportRoute(params: BaseHandlerParams & {
  emotionObj: { label: string; score: number };
  dialogueCtx: DialogueContext | null;
  exerciseInjection: string;
  stateMachinePrompt: string;
  memoryContext: string;
  userTherapistPref?: { preferredTherapist: string | null } | null;
  userPreferences: string[];
  providerOverride?: LlmProviderName;
  modelOverride?: string;
}): Promise<Response> {
  const {
    data,
    message,
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
    history,
    providerOverride,
    modelOverride,
    agentTrace,
  } = params;

  if (process.env.MOCK_SUPPORT_REPLY === '1') {
    const mockText = '我在本地运行，看起来你的状态需要支持。';
    data.append({
      reply: mockText,
      routeType: 'support',
      safety: safetyData,
    } as any);
    data.close();

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`0:${JSON.stringify(mockText)}\n`));
        controller.close();
      },
    });

    return withStreamMetrics(new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      },
    }), {
      sessionId,
      userId,
      routeType: 'support',
      requestStartedAt,
      traceMetadata,
    });
  }

  let sfbtInstruction = undefined;
  const sfbtMatch = message.match(/我完成了“(.+)”练习，现在感觉：.*\((\d+)分\)/);
  if (sfbtMatch) {
    const [_, exerciseName, scoreStr] = sfbtMatch;
    const postScore = parseInt(scoreStr);
    sfbtInstruction = generateSFBTQuery({ postScore, exerciseName });
    logInfo('sfbt-trigger', { exerciseName, postScore });
  }

  data.append({
    timestamp: new Date().toISOString(),
    routeType: 'support',
    state: 'normal',
    emotion: emotionObj,
  });

  const onFinishWithMeta = createOnFinishCallback({
    data, message, history, sessionId, userId, requestStartedAt,
    saveAssistantMessage, scheduleConversationSummaryRefresh,
    safetyData, routeType: 'support', adaptiveMode,
    extraMeta: { state: stateData, adaptiveMode, dialogueContext: dialogueCtx, agentTrace },
    afterFinish: (text) => {
      // SFBT 练习总结提取并写入 ProgressMetric
      if (sfbtMatch && userId) {
        const summaryMatch = text.match(/\*\*本次小结\*\*[：:]\s*(.+)/);
        const summaryText = summaryMatch?.[1]?.trim() || `完成了${sfbtMatch[1]}练习，评分 ${sfbtMatch[2]}/5`;
        recordMetric(userId, 'exercise_summary', parseInt(sfbtMatch[2]), sessionId, summaryText)
          .catch((e) => console.error('[SFBT] Failed to record exercise summary:', e));
      }
    },
  });

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
    userPreferences,
    providerOverride,
    modelOverride,
  });

  return withStreamMetrics(result.toDataStreamResponse({ data }), {
    sessionId,
    userId,
    routeType: 'support',
    requestStartedAt,
    traceMetadata,
  });
}

export async function handleAssessmentRoute(params: BaseHandlerParams & {
  assessmentStage?: string;
  memoryContext: string;
}): Promise<Response> {
  const {
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
  } = params;

  const onAssessmentFinish = async (text: string, toolCalls?: any[]) => {
    const isConclusion = toolCalls?.some(tc => tc.function.name === 'finish_assessment') || false;
    const stage = isConclusion ? 'conclusion' : 'intake';

    const baseFinish = createOnFinishCallback({
      data, message, history, sessionId, userId, requestStartedAt,
      saveAssistantMessage, scheduleConversationSummaryRefresh,
      safetyData, routeType: 'assessment', adaptiveMode,
      extraMeta: { state: stateData, routeType: 'assessment', assessmentStage: stage, agentTrace },
      extraStreamData: { routeType: 'assessment', assessmentStage: stage },
      afterFinish: () => {
        if (!isConclusion && sessionId) {
          analyzeConversationForStuckLoop(sessionId).then(result => {
            if (result?.isStuck) {
              createStuckLoopEvent(sessionId, result);
            }
          }).catch(err => console.error('[StuckLoop] Detection failed:', err));
        }
      },
    });
    await baseFinish(text, toolCalls);
  };

  if (assessmentStage === 'conclusion') {
    const allUserMessages = history.filter(m => m.role === 'user').map(m => m.content);
    allUserMessages.push(message);
    const initialMsg = allUserMessages[0] || message;
    const followupStr = allUserMessages.slice(1).join('\n\n') || '（无补充回答）';

    const onConclusionFinish = async (text: string, actionCards: any[]) => {
      const baseFinish = createOnFinishCallback({
        data, message, history, sessionId, userId, requestStartedAt,
        saveAssistantMessage, scheduleConversationSummaryRefresh,
        safetyData, routeType: 'assessment', adaptiveMode,
        extraMeta: { routeType: 'assessment', assessmentStage: 'conclusion', actionCards, agentTrace },
        extraStreamData: { actionCards, routeType: 'assessment', assessmentStage: 'conclusion' },
        skipQualityCheck: true,
      });
      await baseFinish(text);
    };

    const conclusionResult = await streamAssessmentConclusion(initialMsg, followupStr, history, {
      traceMetadata,
      onFinish: onConclusionFinish
    });
    return withStreamMetrics(conclusionResult.toDataStreamResponse({ data }), {
      sessionId,
      userId,
      routeType: 'assessment',
      requestStartedAt,
      traceMetadata,
    });
  }

  const assessmentResult = await streamAssessmentReply(message, processedHistory, {
    traceMetadata,
    memoryContext,
    onFinish: onAssessmentFinish
  });

  return withStreamMetrics(assessmentResult.toDataStreamResponse({ data }), {
    sessionId,
    userId,
    routeType: 'assessment',
    requestStartedAt,
    traceMetadata,
  });
}
