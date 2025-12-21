import { chatCompletion, chatStructuredCompletion, ChatMessage } from '../deepseek';
import { ASSESSMENT_CONCLUSION_PROMPT } from '../prompts';
import { ActionCard } from '../../../types/chat';
import { gateAssessment, gateActionCardsSteps, GateResult } from './gates';
import { sanitizeActionCards } from './sanitize';
import { getResourceService, RetrievalContext, AnyResource } from '../../rag';
import { AssessmentConclusionSchema } from '../schemas';

export interface AssessmentConclusionResult {
  reply: string;
  actionCards: ActionCard[];
  gate?: {
    pass: boolean;
    fixed: boolean;
    missing: string[];
  };
  debugPrompts?: {
    systemPrompt: string;
    userPrompt: string;
    messages: Array<{ role: string; content: string }>;
  };
  resources?: AnyResource[]; // 新增：检索到的 RAG 资源
}

/**
 * 脱敏函数：隐藏敏感信息
 */
function sanitizeText(text: string): string {
  let sanitized = text;
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-_]+/gi, 'Bearer [REDACTED]');
  sanitized = sanitized.replace(/sk-[A-Za-z0-9\-_]+/gi, 'sk-[REDACTED]');
  sanitized = sanitized.replace(/api[_-]?key\s*[:=]\s*[A-Za-z0-9\-_]+/gi, 'api_key=[REDACTED]');
  sanitized = sanitized.replace(/token\s*[:=]\s*["']?[A-Za-z0-9\-_]+["']?/gi, 'token=[REDACTED]');
  sanitized = sanitized.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '[EMAIL_REDACTED]');
  sanitized = sanitized.replace(/1[3-9]\d[\s\-]?\d{4}[\s\-]?\d{4}/g, '[PHONE_REDACTED]');
  return sanitized;
}

/**
 * 清洗 followupAnswer，移除重复的 initialMessage 内容
 */
function deduplicateFollowupAnswer(followupAnswer: string, initialMessage: string): string {
  let cleaned = followupAnswer.trim();
  if (!cleaned || !initialMessage) return cleaned;

  const initialTrimmed = initialMessage.trim();
  if (initialTrimmed.length === 0) return cleaned;

  const initialComplaintPattern = /初始主诉\s*[:：]\s*/i;
  if (initialComplaintPattern.test(cleaned)) {
    cleaned = cleaned.replace(/初始主诉\s*[:：]\s*[\s\S]*?(?=\n\n对评估问题的回答\s*[:：]|$)/gi, '');
    cleaned = cleaned.replace(/初始主诉\s*[:：]\s*[^\n]*(?:\n|$)/gi, '');
  }

  if (cleaned.includes(initialTrimmed)) {
    const escapedInitial = initialTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fullMatchPattern = new RegExp(`(?:^|\\s|[。！？，、；：])\\s*${escapedInitial}\\s*(?:[。！？，、；：]|\\s|$)`, 'gi');
    cleaned = cleaned.replace(fullMatchPattern, ' ');
    if (cleaned.includes(initialTrimmed) && initialTrimmed.length > 10) {
      cleaned = cleaned.replace(initialTrimmed, '');
    }
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  return cleaned.trim();
}

/**
 * 生成心理评估初筛结论 (Modernized Structured Version)
 */
export async function generateAssessmentConclusion(
  initialMessage: string,
  followupAnswer: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  options?: { traceMetadata?: Record<string, any> }
): Promise<AssessmentConclusionResult> {
  const cleanedFollowupAnswer = deduplicateFollowupAnswer(followupAnswer, initialMessage);
  const shouldIncludeHistory = process.env.CONCLUSION_INCLUDE_HISTORY === '1';

  // 1. RAG 检索
  let ragContext = '';
  let retrievedResources: AnyResource[] = [];
  try {
    const resourceService = getResourceService();
    const retrievalContext: RetrievalContext = {
      routeType: 'assessment',
      userMessage: `${initialMessage} ${cleanedFollowupAnswer}`,
    };
    const ragResult = resourceService.retrieve(retrievalContext, 2);
    if (ragResult.resources.length > 0) {
      ragContext = ragResult.formattedContext;
      retrievedResources = ragResult.resources.map(r => r.resource);
      console.log(`[RAG] Retrieved ${ragResult.resources.length} resources`);
    }
  } catch (ragError) {
    console.error('[RAG] Failed to retrieve resources:', ragError);
  }

  // 2. 构建 Prompt
  const enhancedSystemPrompt = ragContext
    ? `${ASSESSMENT_CONCLUSION_PROMPT}\n\n${ragContext}`
    : ASSESSMENT_CONCLUSION_PROMPT;

  const messages: ChatMessage[] = [
    { role: 'system', content: enhancedSystemPrompt },
    ...(shouldIncludeHistory ? history.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })) : []),
    { role: 'user', content: `初始主诉：${initialMessage}\n\n对评估问题的回答：${cleanedFollowupAnswer}` },
  ];

  // 3. 调用 LLM (结构化生成) - 增加一次重试机会
  let result;
  try {
    result = await chatStructuredCompletion(messages, AssessmentConclusionSchema, {
      temperature: 0.3,
      max_tokens: 1200,
      traceMetadata: options?.traceMetadata,
    });
  } catch (error) {
    console.warn('[Conclusion] First attempt failed, retrying with slightly higher temperature...', error);
    // 重试一次，温度略微升高（增加随机性）或使用固定配置
    try {
      result = await chatStructuredCompletion(messages, AssessmentConclusionSchema, {
        temperature: 0.5,
        max_tokens: 1200,
        traceMetadata: { ...options?.traceMetadata, isRetry: true },
      });
    } catch (retryError) {
      console.error('[Conclusion] All attempts failed:', retryError);
      // 后备：如果全部重试均失败，则构造一个基础的错误回复
      return {
        reply: "抱歉，由于系统暂时无法生成完整的评估结论，请稍后再试或联系我们的客服支持。",
        actionCards: [],
        gate: { pass: false, fixed: false, missing: ["系统解析失败"] }
      };
    }
  }

  if (!result) {
    throw new Error('Unexpected state: conclusion result is null');
  }

  // 4. 组装回复（保持向后兼容 UI）
  const reply = `【初筛总结】
${result.summary}

【风险与分流】
${result.riskAndTriage}

【下一步清单】
${result.nextStepList.map(step => `• ${step}`).join('\n')}`;

  let actionCards = result.actionCards as ActionCard[];

  // 5. 基础清洗 (Sanitize) 
  actionCards = sanitizeActionCards(actionCards);

  // 6. 质量监控 (仅记录日志)
  let gateResult = null;
  if (process.env.GATE_FIX !== '0') {
    const textGate = gateAssessment(reply);
    const cardsGate = gateActionCardsSteps(actionCards);

    gateResult = {
      pass: textGate.pass && cardsGate.pass,
      fixed: false,
      missing: [...(textGate.missing || []), ...(cardsGate.missing || [])]
    };

    if (!gateResult.pass) {
      console.warn('[Gate Monitor] Quality issues detected in structured output:', gateResult.missing);
    }
  }

  // Debug Info
  let debugPrompts;
  if (process.env.DEBUG_PROMPTS === '1') {
    debugPrompts = {
      systemPrompt: sanitizeText(enhancedSystemPrompt),
      userPrompt: sanitizeText(messages[messages.length - 1].content),
      messages: messages.map(m => ({ role: m.role, content: sanitizeText(m.content) })),
    };
  }

  return {
    reply,
    actionCards,
    gate: gateResult || undefined,
    debugPrompts,
    resources: retrievedResources,
  };
}
