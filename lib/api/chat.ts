import { ChatRequest, ChatResponse, RouteType, AssessmentStage, ChatState, ActionCard } from '@/types/chat';
import { z } from 'zod';

// Zod schema for response validation
const ActionCardSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
  when: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  widget: z.string().optional(),
});

const ChatResponseSchema = z.object({
  reply: z.string(),
  emotion: z.object({
    label: z.string(),
    score: z.number(),
  }).optional(),
  timestamp: z.string(),
  routeType: z.enum(['crisis', 'assessment', 'support']),
  state: z.enum(['normal', 'awaiting_followup', 'in_crisis']).optional(),
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
  toolCalls: z.array(z.any()).optional(), // Add toolCalls
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
export async function sendChatMessage(options: {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  state?: ChatState;
  assessmentStage?: AssessmentStage;
  initialMessage?: string;
  meta?: any;
  onTextChunk?: (chunk: string) => void;
  onDataChunk?: (data: any) => void;
  sessionId?: string;
}): Promise<{ response: ValidatedChatResponse; error: ChatApiError | null }> {
  const {
    message,
    history = [],
    state,
    assessmentStage,
    initialMessage,
    meta,
    onTextChunk,
    onDataChunk,
    sessionId,
  } = options;
  try {
    const request: ChatRequest = {
      message,
      history,
      state,
      assessmentStage,
      meta: meta || (initialMessage ? {
        initialMessage,
      } : undefined),
      sessionId, // Pass sessionId
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
    // Safety: Timeout if stream hangs without data for too long
    // Reduced from 10s to 3s to avoid unnecessary delay after content finishes
    const STREAM_TIMEOUT_MS = 3000;

    while (!done) {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<{ done: boolean; value: undefined }>((_, reject) => {
        setTimeout(() => reject(new Error('Stream timeout')), STREAM_TIMEOUT_MS);
      });

      try {
        const { value, done: doneReading } = await Promise.race([
          reader.read(),
          timeoutPromise
        ]);
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
                const items = Array.isArray(data) ? data : [data];
                items.forEach(item => {
                  // Special handling for array fields - concatenate instead of overwrite
                  if (item.actionCards && assembledData.actionCards) {
                    item.actionCards = [...assembledData.actionCards, ...item.actionCards];
                  }
                  assembledData = { ...assembledData, ...item };
                  // Callback for real-time updates
                  if (onDataChunk) {
                    onDataChunk(assembledData);
                  }
                });
              } catch (e) {
                console.error('Error parsing data chunk (2:)', e);
              }
            } else if (line.startsWith('9:')) {
              // Tool Call (New Protocol): 9:{...}
              try {
                const toolCall = JSON.parse(line.substring(2));
                if (!assembledData.toolCalls) assembledData.toolCalls = [];
                assembledData.toolCalls.push(toolCall);
              } catch (e) {
                console.error('Error parsing tool call chunk (9:)', e);
              }
            }
          }
        }
      }
      catch (err) {
        console.error('[API] Stream reading error:', err);
        done = true;
      }
    }

    // Construct the final data object
    let data = {
      ...assembledData,
      // FIX: Accumulated reply from stream should follow metadata reply if stream is empty/only tool calls
      reply: (accumulatedReply && accumulatedReply.trim().length > 0) ? accumulatedReply : (assembledData.reply || ''),
      toolCalls: assembledData.toolCalls || [],
    };

    // Client-Side Adapter: Convert tool calls to legacy fields (actionCards, assistantQuestions)
    // Handle both old format (call.function.name) and new Vercel AI SDK format (call.toolName)
    // NOTE: Only extract from tool calls if actionCards not already present from 2: protocol
    if (data.toolCalls && data.toolCalls.length > 0 && !data.actionCards) {
      data.toolCalls.forEach((call: any) => {
        try {
          // New Vercel AI SDK format: { toolCallId, toolName, args }
          if (call.toolName === 'recommend_skill_card' && call.args) {
            const args = call.args;
            if (args.card) {
              if (!data.actionCards) data.actionCards = [];
              data.actionCards.push(args.card);
            }
          }
          // Legacy format: { function: { name, arguments } }
          else if (call.function && call.function.name === 'recommend_skill_card') {
            const args = typeof call.function.arguments === 'string'
              ? JSON.parse(call.function.arguments)
              : call.function.arguments;

            if (args.card) {
              if (!data.actionCards) data.actionCards = [];
              data.actionCards.push(args.card);
            }
          }
        } catch (e) {
          console.error('[API] Failed to parse tool call args', e);
        }
      });
    }

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
    // FIX: Allow empty reply if there's structured content (actionCards, assistantQuestions, toolCalls)
    const hasStructuredContent = !!(
      (data.actionCards && data.actionCards.length > 0) ||
      (data.assistantQuestions && data.assistantQuestions.length > 0) ||
      (data.toolCalls && data.toolCalls.length > 0)
    );

    if (!data.reply || typeof data.reply !== 'string' || data.reply.trim() === '') {
      if (hasStructuredContent) {
        // Empty reply but has structured content - use a default message
        console.log('[API] Empty reply but has structured content, using default message');
        data.reply = '请查看下方的建议：';
      } else {
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
