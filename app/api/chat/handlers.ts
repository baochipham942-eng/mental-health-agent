import type { UIMessageStreamWriter } from 'ai';
import type { ChatUIMessage, ChatUIChunk, AssessmentStageName, SkillCard } from '@/types/chat-ui-message';

interface FirstTokenLogParams {
  sessionId?: string;
  userId?: string;
  routeType: string;
  requestStartedAt: number;
  traceMetadata?: Record<string, any>;
}

/**
 * 把 LLM 流接到 writer 上的统一入口：
 *   1. 把 SDK 默认的宽 UIMessageStream 类型 cast 成 ChatUIMessage 的窄类型
 *   2. 串接首字日志 transform
 * 用法：writer.merge(pipeLLMStream(result, params))
 */
function pipeLLMStream(
  result: { toUIMessageStream: () => ReadableStream<unknown> },
  params: FirstTokenLogParams,
): ReadableStream<ChatUIChunk> {
  return (result.toUIMessageStream() as ReadableStream<ChatUIChunk>)
    .pipeThrough(createFirstTokenLogger<ChatUIChunk>(params))
    .pipeThrough(createOutputGuardStream<ChatUIChunk>({
      // crisis 路由（含 urgent）整体缓冲审查后再发：首字延迟换确定性安全
      mode: params.routeType === 'crisis' ? 'buffer' : 'stream',
      logContext: { sessionId: params.sessionId, routeType: params.routeType },
    }));
}
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
import { createOutputGuardStream } from '@/lib/ai/guardrails/stream-guard';
import { trackFunnel } from '@/lib/observability/funnel';
import { recordMetric } from '@/lib/ai/progress/tracker';
import type { DialogueContext } from '@/lib/ai/dialogue/state-machine';
import type { AdaptiveMode } from '@/lib/ai/persona-manager';
import type { SceneContext } from '@/lib/ai/scene';
import { buildSceneSystemInjection } from '@/lib/ai/scene';
import type { WebSearchDecision } from '@/lib/ai/websearch';
import { buildWebSearchSystemInjection } from '@/lib/ai/websearch';

type SaveAssistantMessage = (content: string, meta?: Record<string, any>) => Promise<void>;
type RefreshSummary = (params: {
  userId?: string;
  sessionId?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  assistantReply: string;
}) => void;

interface BaseHandlerParams {
  writer: UIMessageStreamWriter<ChatUIMessage>;
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
  sceneContext?: SceneContext;
  webSearchDecision?: WebSearchDecision;
}

/**
 * 首字延迟日志 transform — 替代旧的 withStreamMetrics
 * 在 LLM 流的第一个 chunk 时打 chat-first-token 日志
 */
function createFirstTokenLogger<T>(params: FirstTokenLogParams): TransformStream<T, T> {
  let logged = false;
  return new TransformStream({
    transform(chunk, controller) {
      if (!logged) {
        logged = true;
        logInfo('chat-first-token', {
          sessionId: params.sessionId,
          userId: params.userId,
          routeType: params.routeType,
          llmFirstTokenMs: Date.now() - params.requestStartedAt,
          ...params.traceMetadata,
        });
      }
      controller.enqueue(chunk);
    },
  });
}

interface OnFinishCallbackParams {
  writer: UIMessageStreamWriter<ChatUIMessage>;
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
  /** assessment stage 写入（assessment 路由专用） */
  assessmentStage?: AssessmentStageName;
  /** action cards 写入（assessment 结论专用） */
  actionCards?: SkillCard[];
}

function getToolName(toolCall: any): string | undefined {
  return toolCall?.toolName || toolCall?.function?.name;
}

function getToolInput(toolCall: any): Record<string, any> | undefined {
  if (toolCall?.args && typeof toolCall.args === 'object') return toolCall.args;
  if (toolCall?.input && typeof toolCall.input === 'object') return toolCall.input;

  const rawArguments = toolCall?.function?.arguments;
  if (!rawArguments) return undefined;

  if (typeof rawArguments === 'object') return rawArguments;

  try {
    return JSON.parse(rawArguments);
  } catch {
    return undefined;
  }
}

function findSkillCardToolCall(toolCalls?: any[]) {
  return toolCalls?.find((tc: any) => getToolName(tc) === 'recommend_skill_card');
}

function buildSkillCardFallbackReply(toolCalls?: any[]): string | null {
  const skillCall = findSkillCardToolCall(toolCalls);
  if (!skillCall) return null;

  const input = getToolInput(skillCall);
  const widget = input?.card?.widget;

  switch (widget) {
    case 'breathing':
      return '听起来这会儿身体和脑子都绷得很紧。先看下面这个呼吸练习，帮自己慢慢缓下来一点。';
    case 'meditation':
    case 'leaves_stream':
      return '听起来脑子一直停不下来，确实很耗人。先看下面这个小练习，把注意力慢慢放回当下。';
    case 'empty_chair':
      return '这些话一直压在心里会很难受。先看下面这个练习，给自己一个把话说出来的空间。';
    case 'mood_tracker':
      return '现在的感受值得被认真看见。先看下面这张卡，把这一刻的情绪简单记录下来。';
    default:
      return '听起来这会儿确实有些紧绷。先看下面这个小练习，帮自己慢慢缓下来一点。';
  }
}

function writeFixedText(
  writer: UIMessageStreamWriter<ChatUIMessage>,
  content: string,
  textId: string = 'tool-fallback-text',
): void {
  writer.write({ type: 'text-start', id: textId });
  writer.write({ type: 'text-delta', id: textId, delta: content });
  writer.write({ type: 'text-end', id: textId });
}

/**
 * onFinish 回调工厂 — 统一处理 save/refresh/log/quality-check 以及结束阶段的 part 写入
 */
function createOnFinishCallback(params: OnFinishCallbackParams) {
  const {
    writer, message, history, sessionId, userId, requestStartedAt,
    saveAssistantMessage, scheduleConversationSummaryRefresh,
    safetyData, routeType, adaptiveMode,
    extraMeta, afterFinish, skipQualityCheck, assessmentStage, actionCards,
  } = params;

  return async (text: string, toolCalls?: any[]) => {
    const rawText = text.trim().length > 0
      ? text
      : buildSkillCardFallbackReply(toolCalls) ?? text;

    // Output guard — 检测有害内容/PII/系统泄露
    const guardResult = guardOutput(rawText);
    const safeText = guardResult.safe ? rawText : guardResult.redactedResponse;
    if (!guardResult.safe) {
      logWarn('output-guard-triggered', {
        issues: guardResult.issues,
        sessionId,
        routeType,
      });
      writer.write({
        type: 'data-guard-output-redacted',
        data: { issues: guardResult.issues },
      });
    }

    if (text.trim().length === 0 && safeText.trim().length > 0) {
      writeFixedText(writer, safeText);
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

    if (assessmentStage) {
      writer.write({ type: 'data-assessment-stage', data: { stage: assessmentStage } });
    }
    if (actionCards && actionCards.length > 0) {
      writer.write({ type: 'data-action-cards', data: { cards: actionCards } });
    }

    if (!skipQualityCheck && sessionId) {
      triggerQualityCheck({
        conversationId: sessionId,
        routeType,
        adaptiveMode,
        safetyLevel: safetyData.label,
        reply: safeText,
        userMessage: message,
      });
    }

    // 漏斗埋点：检测技能推荐
    const skillCall = findSkillCardToolCall(toolCalls);
    if (skillCall) {
      const skillType = getToolInput(skillCall)?.card?.widget;
      trackFunnel('l1_skill_recommended', { userId, sessionId, skillType }).catch(() => {});
    }

    afterFinish?.(safeText, toolCalls);
  };
}

export async function handleCrisisRoute(params: BaseHandlerParams & {
  state?: string;
  emotionObj: { label: string; score: number };
  analysis: { safety: string };
}): Promise<void> {
  const {
    writer,
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
    writer.write({ type: 'data-route', data: { routeType: 'support' } });
    writer.write({ type: 'data-state', data: { state: 'normal' } });

    const onDeescalateFinish = createOnFinishCallback({
      writer, message, history, sessionId, userId, requestStartedAt,
      saveAssistantMessage, scheduleConversationSummaryRefresh,
      safetyData, routeType: 'support', adaptiveMode,
      extraMeta: {
        state: stateData,
        agentTrace,
        scene: params.sceneContext,
        webSearch: params.webSearchDecision,
      },
      skipQualityCheck: true,
    });

    const result = await streamSupportReply(message, history, { onFinish: onDeescalateFinish, traceMetadata });
    writer.merge(pipeLLMStream(result, { sessionId, userId, routeType: 'support', requestStartedAt, traceMetadata }));
    return;
  }

  writer.write({ type: 'data-route', data: { routeType: 'crisis' } });
  writer.write({ type: 'data-state', data: { state: 'in_crisis' } });
  writer.write({ type: 'data-emotion', data: emotionObj });

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
    writer, message, history, sessionId, userId, requestStartedAt,
    saveAssistantMessage, scheduleConversationSummaryRefresh,
    safetyData, routeType: 'crisis', adaptiveMode: 'guardian',
    extraMeta: {
      state: stateData,
      agentTrace,
      scene: params.sceneContext,
      webSearch: params.webSearchDecision,
    },
  });

  const result = await streamCrisisReply(message, history, state === 'in_crisis', { onFinish: onCrisisFinish, traceMetadata });
  writer.merge(pipeLLMStream(result, { sessionId, userId, routeType: 'crisis', requestStartedAt, traceMetadata }));
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
  /** triage 产出的意图，决定本轮回复形态（不传时 streamSupportReply 走默认引导） */
  dialogueIntent?: string;
}): Promise<void> {
  const {
    writer,
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
    sceneContext,
    webSearchDecision,
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
    dialogueIntent,
  } = params;

  // TODO: MOCK_SUPPORT_REPLY=1 mock 路径在 v6 升级时移除 —
  // 如需恢复 mock，改用 streamText({model: createMockProvider(), ...}) 或 ai 的 simulateReadableStream

  let sfbtInstruction = undefined;
  const sfbtMatch = message.match(/我完成了"(.+)"练习，现在感觉：.*\((\d+)分\)/);
  if (sfbtMatch) {
    const [_, exerciseName, scoreStr] = sfbtMatch;
    const postScore = parseInt(scoreStr);
    sfbtInstruction = generateSFBTQuery({ postScore, exerciseName });
    logInfo('sfbt-trigger', { exerciseName, postScore });
  }

  writer.write({ type: 'data-route', data: { routeType: 'support' } });
  writer.write({ type: 'data-state', data: { state: 'normal' } });
  writer.write({ type: 'data-emotion', data: emotionObj });

  const onFinishWithMeta = createOnFinishCallback({
    writer, message, history, sessionId, userId, requestStartedAt,
    saveAssistantMessage, scheduleConversationSummaryRefresh,
    safetyData, routeType: 'support', adaptiveMode,
    extraMeta: {
      state: stateData,
      adaptiveMode,
      dialogueContext: dialogueCtx,
      scene: sceneContext,
      webSearch: webSearchDecision,
      agentTrace,
    },
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
  const sceneInjection = sceneContext ? buildSceneSystemInjection(sceneContext) : undefined;
  if (sceneInjection) combinedInjection += `${combinedInjection ? '\n\n' : ''}${sceneInjection}`;
  const webSearchInjection = webSearchDecision ? buildWebSearchSystemInjection(webSearchDecision) : undefined;
  if (webSearchInjection) combinedInjection += `${combinedInjection ? '\n\n' : ''}${webSearchInjection}`;
  if (safetyData.constraints && safetyData.constraints.length > 0) {
    combinedInjection += `\n\n**安全约束（必须遵守）**：\n${safetyData.constraints.map((c: string) => `- ${c}`).join('\n')}`;
  }

  const result = await streamSupportReply(message, processedHistory, {
    onFinish: onFinishWithMeta,
    traceMetadata,
    memoryContext,
    systemInstructionInjection: combinedInjection || undefined,
    adaptiveMode,
    dialogueIntent,
    therapistId: userTherapistPref?.preferredTherapist || undefined,
    userPreferences,
    providerOverride,
    modelOverride,
  });

  writer.merge(pipeLLMStream(result, { sessionId, userId, routeType: 'support', requestStartedAt, traceMetadata }));
}

export async function handleAssessmentRoute(params: BaseHandlerParams & {
  assessmentStage?: string;
  memoryContext: string;
}): Promise<void> {
  const {
    writer,
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
    const stage: AssessmentStageName = isConclusion ? 'conclusion' : 'intake';

    const baseFinish = createOnFinishCallback({
        writer, message, history, sessionId, userId, requestStartedAt,
        saveAssistantMessage, scheduleConversationSummaryRefresh,
        safetyData, routeType: 'assessment', adaptiveMode,
        extraMeta: {
          state: stateData,
          routeType: 'assessment',
          assessmentStage: stage,
          scene: params.sceneContext,
          webSearch: params.webSearchDecision,
          agentTrace,
        },
        assessmentStage: stage,
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
        writer, message, history, sessionId, userId, requestStartedAt,
        saveAssistantMessage, scheduleConversationSummaryRefresh,
        safetyData, routeType: 'assessment', adaptiveMode,
        extraMeta: {
          routeType: 'assessment',
          assessmentStage: 'conclusion',
          actionCards,
          scene: params.sceneContext,
          webSearch: params.webSearchDecision,
          agentTrace,
        },
        assessmentStage: 'conclusion',
        actionCards,
        skipQualityCheck: true,
      });
      await baseFinish(text);
    };

    const conclusionResult = await streamAssessmentConclusion(initialMsg, followupStr, history, {
      traceMetadata,
      onFinish: onConclusionFinish,
    });
    writer.merge(pipeLLMStream(conclusionResult, { sessionId, userId, routeType: 'assessment', requestStartedAt, traceMetadata }));
    return;
  }

  const assessmentResult = await streamAssessmentReply(message, processedHistory, {
    traceMetadata,
    memoryContext,
    onFinish: onAssessmentFinish,
  });

  writer.merge(pipeLLMStream(assessmentResult, { sessionId, userId, routeType: 'assessment', requestStartedAt, traceMetadata }));
}
