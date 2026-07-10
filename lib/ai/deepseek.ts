/**
 * DeepSeek Provider — 全项目默认 LLM
 *
 * 模型说明：
 * - 默认模型 deepseek-v4-flash **默认开启思考模式**：返回 reasoning_content，
 *   即使 reasoning_effort: "low" 也要烧 ~100 reasoning token，且推理会挤占
 *   max_tokens 导致 content 为空 —— 对情绪分析等小额度（max_tokens≈200）调用是生产事故级风险。
 * - 因此本文件对所有 deepseek-v4* 请求统一注入 `thinking: { type: 'disabled' }`
 *   （实测 reasoning_tokens=0、content 正常），已显式设置 thinking 的请求不覆盖。
 * - legacy 别名 deepseek-chat（= v4-flash 非思考模式）2026-07-24 弃用，不能退回去用。
 */
import { ActionCardSchema, AssessmentConclusionSchema, CrisisClassificationSchema, EmotionAnalysisSchema } from './schemas';
import { EmotionAnalysis } from '../../types/emotion';
import { SYSTEM_PROMPT, EMOTION_ANALYSIS_PROMPT } from './prompts';
import { EFT_VALIDATION_PROMPT } from './prompts-eft';
import { createTrace, createGeneration, endGeneration, flushLangfuse, updateTrace } from '../observability/langfuse';
import { getCurrentTrace } from '../observability/trace-context';
import { SDK_TOOLS } from './tools';

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// 全项目统一的 DeepSeek 默认模型（可用 DEEPSEEK_CHAT_MODEL 环境变量覆盖）
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-v4-flash';

// Vercel AI SDK Integration
import { createDeepSeek } from '@ai-sdk/deepseek';
import { streamText, generateText } from 'ai';

const deepseekBaseUrl = (process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/chat\/completions$/, '');

/**
 * 给原始请求体注入 thinking disabled（原因见文件头注释）。
 * 仅对 deepseek-v4* 模型生效（DEEPSEEK_CHAT_MODEL 可被 env 覆盖成别的模型），
 * 已显式设置 thinking 的请求不覆盖。
 */
export function withThinkingDisabled<T extends { model?: string; thinking?: unknown }>(body: T): T {
  if (typeof body.model === 'string' && body.model.startsWith('deepseek-v4') && body.thinking === undefined) {
    return { ...body, thinking: { type: 'disabled' } } as T;
  }
  return body;
}

/**
 * 自定义 fetch：向 AI SDK provider 的请求体注入两类默认值
 * 1. thinking disabled（照 lib/ai/kimi.ts 的 kimiNoReasoningFetch 既有模式）
 * 2. 首条 system 消息的 cache_control 前缀缓存 —— 对齐非流式 chatCompletion 的注入策略，
 *    覆盖 streamChatCompletion 等所有走 AI SDK provider 的流式路径
 */
export const deepseekNoThinkingFetch: typeof globalThis.fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      let mutated = false;
      if (typeof body.model === 'string' && body.model.startsWith('deepseek-v4') && body.thinking === undefined) {
        body.thinking = { type: 'disabled' };
        mutated = true;
      }
      const firstMessage = Array.isArray(body.messages) ? body.messages[0] : undefined;
      if (firstMessage?.role === 'system' && firstMessage.cache_control === undefined) {
        firstMessage.cache_control = { type: 'ephemeral' };
        mutated = true;
      }
      if (mutated) {
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // JSON 解析失败不影响原始请求
    }
  }
  return globalThis.fetch(input, init);
};

export const deepseek = createDeepSeek({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: deepseekBaseUrl,
  fetch: deepseekNoThinkingFetch,
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
  cache_control?: { type: 'ephemeral' };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      refusal?: string | null; // Add refusal field
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

/**
 * 调用DeepSeek API进行对话
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    responseFormat?: 'json_object' | 'text';
    tools?: any[];
    toolChoice?: any;
    traceMetadata?: Record<string, any>;
  }
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  // Auto-inject cache_control for the last system message (DeepSeek best practice)
  // Actually, caching the first system prompt is usually enough for prefix caching
  const messagesWithCache = messages.map((msg, index) => {
    // Only cache the first system message or the one with large context
    // Simple strategy: Cache the first system message
    if (msg.role === 'system' && index === 0) {
      return { ...msg, cache_control: { type: 'ephemeral' } };
    }
    return msg;
  });

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(withThinkingDisabled({
      model: DEEPSEEK_MODEL,
      messages: messagesWithCache,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      stream: options?.stream ?? false,
      response_format: options?.responseFormat ? { type: options.responseFormat } : undefined,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
    })),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  const data: ChatCompletionResponse = await response.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response from DeepSeek API');
  }

  const choice = data.choices[0];
  const output = choice.message.content || '';
  const refusal = choice.message.refusal;
  const toolCalls = choice.message.tool_calls;

  if (refusal) {
    console.error('[DeepSeek] Model refused to respond:', refusal);
    throw new Error(`AI refused to respond: ${refusal}`);
  }

  // LangFuse Tracing — 优先挂载到请求级 trace（如有），否则创建独立 trace
  const parentCtx = getCurrentTrace();
  const traceTarget = parentCtx?.trace || createTrace(
    'chatCompletion',
    {
      model: DEEPSEEK_MODEL,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      responseFormat: options?.responseFormat,
      toolsCount: options?.tools?.length,
      ...options?.traceMetadata,
    },
    messages
  );
  if (traceTarget) {
    const generation = createGeneration(traceTarget, 'DeepSeek Chat', messages, DEEPSEEK_MODEL);
    endGeneration(generation, output, {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    });

    // 仅独立 trace 时更新 output（请求级 trace 由路由层负责）
    if (!parentCtx) {
      updateTrace(traceTarget, { output: output, metadata: { toolCalls } });
      await flushLangfuse();
    }
  }

  return { reply: output, toolCalls };
}

/**
 * 通用结构化输出调用
 */
export async function chatStructuredCompletion<T>(
  messages: ChatMessage[],
  schema: { parse: (val: any) => T },
  options?: {
    temperature?: number;
    max_tokens?: number;
    traceMetadata?: Record<string, any>;
  }
): Promise<T> {
  const response = await chatCompletion(messages, {
    ...options,
    responseFormat: 'json_object',
  });

  let json;
  try {
    // 尝试直接解析，预处理：移除可能存在的 Markdown 标记
    const cleanedReply = response.reply.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    json = JSON.parse(cleanedReply);
  } catch (e) {
    // 如果直接解析失败，尝试从响应中提取 JSON 代码块
    console.warn('[DeepSeek] Direct JSON parse failed, trying to extract from markdown blocks', { reply: response.reply.substring(0, 100) + '...' });

    // 1. 尝试匹配 ```json ... ```
    // 2. 尝试匹配第一个 { ... }
    const jsonMatch = response.reply.match(/```json\n?([\s\S]*?)\n?```/)
      || response.reply.match(/{[\s\S]*}/);

    if (jsonMatch) {
      try {
        const extracted = (jsonMatch[1] || jsonMatch[0]).trim();
        json = JSON.parse(extracted);
      } catch (innerError) {
        console.error('[DeepSeek] Extraction parse failed:', innerError);
      }
    }
  }

  if (json) {
    try {
      return schema.parse(json);
    } catch (validationError) {
      console.error('[DeepSeek] Schema validation failed:', validationError, 'JSON:', json);
      // 如果校验失败，仍然抛出错误以便上层处理（如触发修复逻辑）
      throw validationError;
    }
  }

  console.error('[DeepSeek] All structured parse attempts failed. Response:', response);
  throw new Error('Failed to parse structured output from AI');
}

/**
 * Stream chat completion using Vercel AI SDK
 * Note: Uses built-in SDK_TOOLS for tool support (unified format)
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    onFinish?: (text: string, toolCalls?: any[]) => Promise<void>;
    enableTools?: boolean; // 是否启用工具（默认 false，因为大多数场景不需要）
    traceMetadata?: Record<string, any>;
  }
) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  // Convert ChatMessage to CoreMessage format expected by AI SDK
  // They are basically the same structure { role, content }
  const coreMessages = messages.map(m => ({
    role: m.role as 'system' | 'user' | 'assistant',
    content: m.content
  }));

  const result = await streamText({
    model: deepseek(DEEPSEEK_MODEL),
    messages: coreMessages,
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.max_tokens ?? 2000,
    tools: options?.enableTools ? SDK_TOOLS : undefined, // Use unified SDK_TOOLS format when enabled

    onFinish: async ({ text, usage, finishReason, toolCalls }) => {
      // Call external onFinish with text and toolCalls (必须等待)
      if (options?.onFinish) {
        // Convert tool calls to a more usable format for API response
        const formattedToolCalls = toolCalls?.map((tc: any) => ({
          id: tc.toolCallId,
          type: 'function' as const,
          function: {
            name: tc.toolName,
            arguments: tc.args
          }
        }));
        await options.onFinish(text, formattedToolCalls);
      }

      // LangFuse Tracing + ChatMetric (Async, Non-Blocking)
      (async () => {
        try {
          const parentCtx = getCurrentTrace();
          const traceTarget = parentCtx?.trace || createTrace(
            'streamChatCompletion',
            {
              model: DEEPSEEK_MODEL,
              temperature: options?.temperature ?? 0.7,
              max_tokens: options?.max_tokens ?? 2000,
              finishReason,
              toolCalls,
              ...options?.traceMetadata,
            },
            messages
          );

          if (traceTarget) {
            const generation = createGeneration(traceTarget, 'DeepSeek Stream', messages, DEEPSEEK_MODEL);
            endGeneration(generation, text, {
              promptTokens: usage.inputTokens,
              completionTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
            });

            if (!parentCtx) {
              updateTrace(traceTarget, { output: text });
              await flushLangfuse();
            }
          }

          // Sprint 4: 写入 ChatMetric
          const convId = (options?.traceMetadata as any)?.sessionId || parentCtx?.sessionId;
          if (convId) {
            const { recordMetric: recordChatMetric } = await import('@/lib/observability/metrics-collector');
            recordChatMetric({
              conversationId: convId,
              model: DEEPSEEK_MODEL,
              promptTokens: usage.inputTokens ?? 0,
              completionTokens: usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
              latencyMs: parentCtx ? Date.now() - parentCtx.startTime : 0,
            }).catch(() => {});
          }
        } catch (e) {
          console.error('[LangFuse] Async trace error:', e);
        }
      })();
    },
  });

  return result;
}

/**
 * 生成心理咨询回复
 */
export async function generateCounselingReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const result = await chatCompletion(messages, {
    temperature: 0.8,
    max_tokens: 500,
  });

  return result.reply;
}

/**
 * 分析用户情绪
 */
export async function analyzeEmotion(userMessage: string, options?: { traceMetadata?: Record<string, any> }): Promise<EmotionAnalysis | null> {
  if (!DEEPSEEK_API_KEY) {
    // 如果API未配置，返回默认情绪
    return {
      label: '平静',
      score: 5,
      confidence: 0.5,
    };
  }

  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: EMOTION_ANALYSIS_PROMPT,
      },
      {
        role: 'user',
        content: `请分析以下文本的情绪：\n\n${userMessage}`,
      },
    ];

    return await chatStructuredCompletion(messages, EmotionAnalysisSchema, {
      temperature: 0.3,
      max_tokens: 200,
      traceMetadata: options?.traceMetadata,
    });
  } catch (error) {
    console.error('Emotion analysis error:', error);
    // 关键词匹配作为后备方案
    return matchEmotionByKeywords(userMessage);
  }
}

/**
 * 基于关键词的情绪匹配（后备方案）
 */
function matchEmotionByKeywords(text: string): EmotionAnalysis {
  const lowerText = text.toLowerCase();

  const keywords: Record<string, string[]> = {
    '焦虑': ['焦虑', '担心', '紧张', '不安', '害怕', '恐慌'],
    '抑郁': ['抑郁', '沮丧', '低落', '无望', '绝望', '难过'],
    '愤怒': ['愤怒', '生气', '烦躁', '不满', '恼火', '气愤'],
    '悲伤': ['悲伤', '难过', '失落', '痛苦', '伤心', '哭泣'],
    '恐惧': ['恐惧', '害怕', '担忧', '恐慌', '恐惧', '担心'],
    '快乐': ['快乐', '开心', '满足', '愉悦', '高兴', '兴奋'],
  };

  for (const [emotion, words] of Object.entries(keywords)) {
    if (words.some(word => lowerText.includes(word))) {
      return {
        label: emotion as any,
        score: 7,
        confidence: 0.6,
      };
    }
  }

  return {
    label: '平静',
    score: 5,
    confidence: 0.5,
  };
}





/**
 * 生成 EFT (情绪聚焦) 共情回复 (流式)
 */
export async function streamEFTValidationReply(
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    options?: {
        onFinish?: (text: string) => Promise<void>;
        traceMetadata?: Record<string, any>;
    }
) {
    // 构建 EFT 专用上下文
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: EFT_VALIDATION_PROMPT,
        },
        ...history.slice(-6).map(msg => ({ // 只取最近 6 条，聚焦当下情绪
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        })),
        {
            role: 'user',
            content: userMessage,
        },
    ];

    return streamChatCompletion(messages, {
        temperature: 0.9, // 稍微提高温度，增加情感丰富度
        max_tokens: 400,
        traceMetadata: { ...options?.traceMetadata, type: 'eft_validation' },
        onFinish: async (text, toolCalls) => {
            if (options?.onFinish) {
                await options.onFinish(text);
            }
        }
    });
}
