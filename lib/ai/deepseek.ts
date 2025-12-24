import { ActionCardSchema, AssessmentConclusionSchema, CrisisClassificationSchema, EmotionAnalysisSchema } from './schemas';
import { EmotionAnalysis } from '../../types/emotion';
import { SYSTEM_PROMPT, EMOTION_ANALYSIS_PROMPT } from './prompts';
import { EFT_VALIDATION_PROMPT } from './prompts-eft';
import { createTrace, createGeneration, endGeneration, flushLangfuse, updateTrace } from '../observability/langfuse';
import { SDK_TOOLS } from './tools';

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Vercel AI SDK Integration
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';

// Create DeepSeek provider instance
// Start with base URL but remove '/chat/completions' as the SDK appends it or uses standard endpoints
// DeepSeek uses standard OpenAI compatible endpoints: https://api.deepseek.com/v1
const deepseekBaseUrl = (process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/chat\/completions$/, '');

export const deepseek = createOpenAI({
  baseURL: deepseekBaseUrl,
  apiKey: DEEPSEEK_API_KEY,
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
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messagesWithCache,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      stream: options?.stream ?? false,
      response_format: options?.responseFormat ? { type: options.responseFormat } : undefined,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
    }),
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

  // LangFuse Tracing
  const trace = createTrace(
    'chatCompletion',
    {
      model: 'deepseek-chat',
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      responseFormat: options?.responseFormat,
      toolsCount: options?.tools?.length,
      ...options?.traceMetadata,
    },
    messages // Input
  );
  if (trace) {
    const generation = createGeneration(trace, 'DeepSeek Chat', messages, 'deepseek-chat');
    endGeneration(generation, output, {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    });

    // Update trace with output
    updateTrace(trace, { output: output, metadata: { toolCalls } });

    await flushLangfuse();
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
    model: deepseek('deepseek-chat'),
    messages: coreMessages,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.max_tokens ?? 2000,
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

      // LangFuse Tracing (Async, Non-Blocking)
      // 使用 setImmediate pattern 确保不阻塞流关闭
      // 这样用户端能立即收到流结束信号，而日志在后台发送
      (async () => {
        try {
          const trace = createTrace(
            'streamChatCompletion',
            {
              model: 'deepseek-chat',
              temperature: options?.temperature ?? 0.7,
              max_tokens: options?.max_tokens ?? 2000,
              finishReason,
              toolCalls,
              ...options?.traceMetadata,
            },
            messages // Input
          );

          if (trace) {
            const generation = createGeneration(trace, 'DeepSeek Stream', messages, 'deepseek-chat');
            endGeneration(generation, text, {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            });

            // Update trace with output
            updateTrace(trace, { output: text });

            await flushLangfuse();
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
