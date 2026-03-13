import type { StreamData } from 'ai';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import { streamAssessmentReply } from '@/lib/ai/assessment';
import { streamAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { streamEFTValidationReply } from '@/lib/ai/deepseek';
import { generateSFBTQuery } from '@/lib/ai/sfbt';
import { analyzeConversationForStuckLoop, createStuckLoopEvent } from '@/lib/ai/detection/stuck-loop';
import { triggerQualityCheck } from '@/lib/ai/agents/orchestrator';
import { createCrisisEscalation } from '@/lib/ai/crisis-escalation';
import { logInfo } from '@/lib/observability/logger';
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
    analysis,
    state,
    emotionObj,
  } = params;

  const isExplicitSafety = /我没事了|感觉好多了|已经不处在危险中了|放心吧|删除.*记忆|不聊了|换个话题/.test(message);
  const isAnalysedSafe = safetyData.label === 'normal';

  if (state === 'in_crisis' && (isExplicitSafety || isAnalysedSafe)) {
    console.log('[API] De-escalating crisis state based on validation:', { isExplicitSafety, isAnalysedSafe });
    data.append({ timestamp: new Date().toISOString(), routeType: 'support', state: 'normal', emotion: null });

    const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
      saveAssistantMessage(text, {
        toolCalls,
        safety: safetyData,
        state: stateData,
      }).catch(e => console.error('[DB] Failed to save assistant message:', e));
      scheduleConversationSummaryRefresh({ userId, sessionId, history, message, assistantReply: text });
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
    };

    const result = await streamSupportReply(message, history, { onFinish: onFinishWithMeta, traceMetadata });
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

  const onCrisisFinish = async (text: string, toolCalls?: any[]) => {
    saveAssistantMessage(text, {
      toolCalls,
      safety: safetyData,
      state: stateData,
    }).catch(e => console.error('[DB] Failed to save assistant message:', e));
    scheduleConversationSummaryRefresh({ userId, sessionId, history, message, assistantReply: text });
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
  };

  const result = await streamCrisisReply(message, history, state === 'in_crisis', { onFinish: onCrisisFinish, traceMetadata });
  return withStreamMetrics(result.toDataStreamResponse({ data }), {
    sessionId,
    userId,
    routeType: 'crisis',
    requestStartedAt,
    traceMetadata,
  });
}

export async function handleValidationRoute(params: BaseHandlerParams): Promise<Response> {
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
    history,
  } = params;

  console.log('[API] EFT Validation triggered (High Emotion Score)');

  const onFinishWithMeta = async (text: string) => {
    saveAssistantMessage(text, {
      routeType: 'support',
      subRoute: 'eft_validation',
      safety: safetyData,
      state: stateData
    }).catch(e => console.error('[DB] Failed to save assistant message:', e));
    scheduleConversationSummaryRefresh({ userId, sessionId, history, message, assistantReply: text });
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
  return withStreamMetrics(result.toDataStreamResponse({ data }), {
    sessionId,
    userId,
    routeType: 'support',
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
  } = params;

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

  const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
    saveAssistantMessage(text, {
      toolCalls,
      safety: safetyData,
      state: stateData,
      adaptiveMode,
      dialogueContext: dialogueCtx,
    }).catch(e => console.error('[DB] Failed to save assistant message:', e));
    scheduleConversationSummaryRefresh({ userId, sessionId, history, message, assistantReply: text });
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
    userPreferences
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
  } = params;

  const onAssessmentFinish = async (text: string, toolCalls?: any[]) => {
    const isConclusion = toolCalls?.some(tc => tc.function.name === 'finish_assessment') || false;

    saveAssistantMessage(text, {
      toolCalls,
      routeType: 'assessment',
      assessmentStage: isConclusion ? 'conclusion' : 'intake',
      safety: safetyData,
      state: stateData,
    }).catch(e => console.error('[DB] Failed to save assistant message:', e));
    scheduleConversationSummaryRefresh({ userId, sessionId, history, message, assistantReply: text });
    logInfo('chat-response-finished', {
      sessionId,
      userId,
      routeType: 'assessment',
      assessmentStage: isConclusion ? 'conclusion' : 'intake',
      totalDurationMs: Date.now() - requestStartedAt,
      responseLength: text.length,
    });

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

  if (assessmentStage === 'conclusion') {
    const allUserMessages = history.filter(m => m.role === 'user').map(m => m.content);
    allUserMessages.push(message);
    const initialMsg = allUserMessages[0] || message;
    const followupStr = allUserMessages.slice(1).join('\n\n') || '（无补充回答）';

    const onConclusionFinish = async (text: string, actionCards: any[]) => {
      saveAssistantMessage(text, {
        routeType: 'assessment',
        assessmentStage: 'conclusion',
        actionCards,
      }).catch(e => console.error('[DB] Failed to save assistant message:', e));
      scheduleConversationSummaryRefresh({ userId, sessionId, history, message, assistantReply: text });
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
