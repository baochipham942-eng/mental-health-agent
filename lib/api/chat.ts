import { ChatRequest, ChatResponse, RouteType, AssessmentStage, ChatState, ActionCard } from '@/types/chat';
import { z } from 'zod';

// Zod schema for response validation
const ActionCardSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
  when: z.string(),
  effort: z.enum(['low', 'medium', 'high']),
});

const ChatResponseSchema = z.object({
  reply: z.string(),
  emotion: z.object({
    label: z.string(),
    score: z.number(),
  }).optional(),
  timestamp: z.string(),
  routeType: z.enum(['crisis', 'assessment', 'support']),
  state: z.enum(['normal', 'awaiting_followup']).optional(),
  assessmentStage: z.enum(['intake', 'gap_followup', 'conclusion']).optional(),
  assistantQuestions: z.array(z.string()).optional(),
  actionCards: z.array(ActionCardSchema).optional(),
  gate: z.object({
    pass: z.boolean(),
    fixed: z.boolean().optional(),
    missing: z.array(z.string()).optional(),
  }).optional(),
  debugPrompts: z.object({
    systemPrompt: z.string(),
    userPrompt: z.string(),
    messages: z.array(z.object({
      role: z.string(),
      content: z.string(),
    })),
    selectedSkillIds: z.array(z.string()).optional(),
    selectionReason: z.string().optional(),
    slotValues: z.record(z.any()).optional(),
  }).optional(),
  perf: z.object({
    total: z.number(),
    llm_main: z.number(),
    parse: z.number(),
    gate_text: z.number(),
    gate_cards: z.number(),
    sanitize: z.number(),
    repair: z.number(),
    repairTriggered: z.boolean(),
  }).optional(),
});

export interface ChatApiError {
  error: string;
  details?: string;
}

export interface ValidatedChatResponse extends ChatResponse {
  validationError?: {
    actionCards?: string;
    nextStepsLines?: string;
  };
}

/**
 * 从 reply 文本中提取【下一步清单】
 */
export function extractNextStepsLines(reply: string): string[] {
  const nextStepsMatch = reply.match(/【下一步清单】\s*\n([\s\S]*?)(?=【|$)/);
  if (!nextStepsMatch) {
    return [];
  }

  const lines = nextStepsMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      // 匹配 "1. xxx" 或 "- xxx" 格式
      return /^[\d\-\.]\s*/.test(line) && line.length > 2;
    })
    .map(line => {
      // 移除序号前缀
      return line.replace(/^[\d\-\.]\s*/, '').trim();
    })
    .filter(line => line.length > 0);

  return lines;
}

/**
 * 从 reply 文本中提取【初筛总结】
 */
export function extractSummary(reply: string): string | null {
  const summaryMatch = reply.match(/【初筛总结】\s*\n([\s\S]*?)(?=【|$)/);
  if (!summaryMatch) {
    return null;
  }
  return summaryMatch[1].trim();
}

/**
 * 从 reply 文本中提取【风险与分流】
 */
export function extractRiskTriage(reply: string): string | null {
  const riskMatch = reply.match(/【风险与分流】\s*\n([\s\S]*?)(?=【|$)/);
  if (!riskMatch) {
    return null;
  }
  return riskMatch[1].trim();
}

/**
 * 发送聊天消息
 */
export async function sendChatMessage(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  state?: ChatState,
  assessmentStage?: AssessmentStage,
  initialMessage?: string,
  meta?: any,  // 新增：传递 meta（包括 followupSlot）
  onTextChunk?: (chunk: string) => void, // Callback for streaming text
): Promise<{ response: ValidatedChatResponse; error: ChatApiError | null }> {
  try {
    const request: ChatRequest = {
      message,
      history,
      state,
      assessmentStage,
      meta: meta || (initialMessage ? {
        initialMessage,
      } : undefined),
    };

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: '请求失败' }));
      return {
        response: {} as ValidatedChatResponse,
        error: {
          error: errorData.error || '请求失败',
          details: errorData.details,
        },
      };
    }

    if (!res.body) {
      throw new Error('No response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let accumulatedReply = '';
    let assembledData: any = {};

    let buffer = '';

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;

      if (value) {
        buffer += decoder.decode(value, { stream: true });

        // Split by newline
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (!line) continue;

          if (line.startsWith('0:')) {
            // Text chunk: 0:"text"
            try {
              const text = JSON.parse(line.substring(2));
              accumulatedReply += text;
              if (onTextChunk) {
                onTextChunk(text);
              }
            } catch (e) {
              console.error('Error parsing text chunk', e);
            }
          } else if (line.startsWith('d:')) {
            // Data chunk (Legacy): d:{...}
            try {
              const data = JSON.parse(line.substring(2));
              assembledData = { ...assembledData, ...data };
            } catch (e) {
              console.error('Error parsing data chunk (d:)', e);
            }
          } else if (line.startsWith('2:')) {
            // Data chunk (New Protocol): 2:[...]
            try {
              const data = JSON.parse(line.substring(2));
              // Vercel SDK sends an array of data items
              if (Array.isArray(data)) {
                // Merge all items in the array
                data.forEach(item => {
                  assembledData = { ...assembledData, ...item };
                });
              } else {
                assembledData = { ...assembledData, ...data };
              }
            } catch (e) {
              console.error('Error parsing data chunk (2:)', e);
            }
          }
        }
      }
    }

    // Construct the final data object
    let data = {
      ...assembledData,
      reply: accumulatedReply,
    };

    // Dev 模式：支持 ?debugInvalid=1 开关模拟校验失败，?debugEmptyReply=1 模拟空回复
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const debugInvalid = urlParams?.get('debugInvalid') === '1';
    const debugEmptyReply = urlParams?.get('debugEmptyReply') === '1';

    if (debugInvalid && process.env.NODE_ENV === 'development') {
      console.warn('[Debug] Simulating validation failure via ?debugInvalid=1');
      // 破坏 actionCards 格式以触发校验失败
      if (data.assessmentStage === 'conclusion' && data.actionCards) {
        data = {
          ...data,
          actionCards: [{ invalid: 'field' }],
        };
      }
    }

    if (debugEmptyReply && process.env.NODE_ENV === 'development') {
      console.warn('[Debug] Simulating empty reply via ?debugEmptyReply=1');
      data = {
        ...data,
        reply: '',
      };
    }

    // 兜底校验：检查 reply 是否存在且非空
    if (!data.reply || typeof data.reply !== 'string' || data.reply.trim() === '') {
      const errorMsg = '服务器返回了空回复';
      console.error('[API Error]', errorMsg, data);
      return {
        response: {} as ValidatedChatResponse,
        error: {
          error: errorMsg,
          details: 'EMPTY_REPLY',
        },
      };
    }

    // 使用 zod 校验响应
    const validationResult = ChatResponseSchema.safeParse(data);

    // 初始化验证错误对象
    const validationError: ValidatedChatResponse['validationError'] = {};

    // 仅在 conclusion 阶段且非 crisis 时校验结构化字段
    const isConclusion = data.assessmentStage === 'conclusion';
    const isCrisis = data.routeType === 'crisis';
    const shouldValidateStructured = isConclusion && !isCrisis;

    if (!validationResult.success) {
      // 整体校验失败，记录详细错误
      console.warn('[Validation] ChatResponse schema validation failed:', validationResult.error);
    }

    // 单独校验 actionCards（仅在 conclusion 阶段且非 crisis 时）
    if (shouldValidateStructured && data.actionCards) {
      const actionCardsResult = z.array(ActionCardSchema).safeParse(data.actionCards);
      if (!actionCardsResult.success) {
        validationError.actionCards = `actionCards 格式校验失败: ${actionCardsResult.error.message}`;
        console.warn('[Validation] actionCards validation failed:', actionCardsResult.error);
      } else if (data.actionCards.length !== 2) {
        // 容错：少于 2 张时按实际渲染，但记录警告
        if (data.actionCards.length < 2) {
          console.warn(`[Validation] actionCards 数量不足（期望2张，实际${data.actionCards.length}张），将按实际数量渲染`);
        } else {
          validationError.actionCards = `actionCards 数量不符合要求（期望2张，实际${data.actionCards.length}张）`;
        }
      }
    }

    // 校验 nextStepsLines（从 reply 中提取，仅在 conclusion 阶段且非 crisis 时）
    if (shouldValidateStructured) {
      const nextStepsLines = extractNextStepsLines(data.reply);
      if (nextStepsLines.length > 0) {
        if (nextStepsLines.length < 2 || nextStepsLines.length > 3) {
          validationError.nextStepsLines = `nextStepsLines 数量不符合要求（期望2-3条，实际${nextStepsLines.length}条）`;
        }
      }
    }

    // 如果有验证错误，返回降级响应
    if (Object.keys(validationError).length > 0) {
      return {
        response: {
          ...data,
          validationError,
        } as ValidatedChatResponse,
        error: null,
      };
    }

    return {
      response: data as ValidatedChatResponse,
      error: null,
    };
  } catch (err) {
    return {
      response: {} as ValidatedChatResponse,
      error: {
        error: '网络错误',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
    };
  }
}
