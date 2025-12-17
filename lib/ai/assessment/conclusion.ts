import { chatCompletion, ChatMessage } from '../deepseek';
import { ASSESSMENT_CONCLUSION_PROMPT } from '../prompts';
import { ActionCard } from '../../../types/chat';
import { gateAssessment, gateActionCardsSteps, GateResult } from './gates';
import { sanitizeActionCards } from './sanitize';
import { getResourceService, RetrievalContext, AnyResource } from '../../rag';

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
 * 从回复文本中提取 actionCards JSON
 */
function extractActionCards(reply: string): ActionCard[] {
  try {
    const jsonMatch = reply.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.actionCards && Array.isArray(parsed.actionCards)) return parsed.actionCards;
    }
    const jsonObjectMatch = reply.match(/\{\s*"actionCards"\s*:[\s\S]*\}/);
    if (jsonObjectMatch) {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      if (parsed.actionCards && Array.isArray(parsed.actionCards)) return parsed.actionCards;
    }
  } catch (e) {
    console.error('Failed to parse actionCards from reply:', e);
  }
  return [];
}

/**
 * 从回复文本中移除 actionCards JSON，只保留文本部分
 */
export function removeActionCardsFromReply(reply: string): string {
  let cleaned = reply;
  // Remove 'Next Steps' section
  cleaned = cleaned.replace(/【下一步清单】[\s\S]*?(?=【|$)/g, '');

  // Remove actionCards JSON blocks
  cleaned = cleaned.replace(/```json\s*[\s\S]*?\s*```/gi, '');
  cleaned = cleaned.replace(/\{\s*"actionCards"\s*:[\s\S]*?\}/g, '');
  cleaned = cleaned.replace(/\{\s*"actionCards"\s*:[\s\S]*$/g, '');
  return cleaned.trim();
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
 * 生成心理评估初筛结论 (MVP Simplified Version)
 * 移除 Skill Engine 和 Repair Loop，采用 Prompt 驱动 + 尽力清洗策略
 */
export async function generateAssessmentConclusion(
  initialMessage: string,
  followupAnswer: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
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
      console.log(`[RAG] Retrieved ${ragResult.resources.length} resources in ${ragResult.retrievalTime}ms`);
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

  // 3. 调用 LLM (单次生成)
  const fullReply = await chatCompletion(messages, {
    temperature: 0.3,
    max_tokens: 1000,
  });

  // 4. 解析结果
  const reply = removeActionCardsFromReply(fullReply);
  let actionCards = extractActionCards(fullReply);

  // 5. 基础清洗 (Sanitize) - 只做低成本的格式修正
  actionCards = sanitizeActionCards(actionCards);

  // 6. 被动监控 (Monitor only) - 不触发 Repair
  let gateResult = null;
  if (process.env.GATE_FIX !== '0') {
    const textGate = gateAssessment(reply);
    const cardsGate = gateActionCardsSteps(actionCards);

    // 仅记录日志
    if (!textGate.pass || !cardsGate.pass) {
      console.warn('[Gate Monitor] Conclusion quality check failed (Repair disabled in MVP Simplification):');
      if (!textGate.pass) console.warn('  Text missing:', textGate.missing);
      if (!cardsGate.pass) {
        cardsGate.details?.invalidSteps?.forEach((inv: any) =>
          console.warn(`  Card invalid: Card ${inv.cardIndex} Step ${inv.stepIndex} - ${inv.reason}`)
        );
      }
    }

    gateResult = {
      pass: textGate.pass && cardsGate.pass,
      fixed: false,
      missing: [...(textGate.missing || []), ...(cardsGate.missing || [])]
    };
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
