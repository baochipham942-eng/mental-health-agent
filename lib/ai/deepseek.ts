import { ActionCardSchema, AssessmentConclusionSchema, CrisisClassificationSchema, EmotionAnalysisSchema } from './schemas';
import { EmotionAnalysis } from '../../types/emotion';
import { SYSTEM_PROMPT, EMOTION_ANALYSIS_PROMPT } from './prompts';
import { createTrace, createGeneration, endGeneration, flushLangfuse, updateTrace } from '../observability/langfuse';

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
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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
  }
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
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
  const toolCalls = choice.message.tool_calls;

  // LangFuse Tracing
  const trace = createTrace(
    'chatCompletion',
    {
      model: 'deepseek-chat',
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      responseFormat: options?.responseFormat,
      toolsCount: options?.tools?.length,
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
  }
): Promise<T> {
  const response = await chatCompletion(messages, {
    ...options,
    responseFormat: 'json_object',
  });

  try {
    const json = JSON.parse(response.reply);
    return schema.parse(json);
  } catch (e) {
    console.error('[DeepSeek] Structured parse failed:', e, 'Response:', response);
    throw new Error('Failed to parse structured output from AI');
  }
}

/**
 * Stream chat completion using Vercel AI SDK
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    onFinish?: (text: string) => Promise<void>;
    tools?: any;
    toolChoice?: any;
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
    // Note: tools removed from streaming - use non-streaming chatCompletion for tool calls
    // Vercel AI SDK requires Zod-based tool definitions via tool() helper
    onFinish: async ({ text, usage, finishReason, toolCalls }) => {
      // Call external onFinish if provided
      if (options?.onFinish) {
        await options.onFinish(text);
      }

      // LangFuse Tracing (Async)
      const trace = createTrace(
        'streamChatCompletion',
        {
          model: 'deepseek-chat',
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.max_tokens ?? 2000,
          finishReason,
          toolCalls,
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
export async function analyzeEmotion(userMessage: string): Promise<EmotionAnalysis | null> {
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




