import {
  chatCompletion as deepseekChatCompletion,
  chatStructuredCompletion as deepseekStructuredCompletion,
  streamChatCompletion as deepseekStreamChatCompletion,
  type ChatMessage,
  type ToolCall,
} from '@/lib/ai/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText as sdkStreamText } from 'ai';
import { withResilience } from './resilience';

export type { ChatMessage, ToolCall };

export type LlmProviderName = 'deepseek' | 'glm' | 'openrouter' | 'kimi' | 'openai';

export interface GenerateTextOptions {
  provider?: LlmProviderName;
  temperature?: number;
  max_tokens?: number;
  responseFormat?: 'json_object' | 'text';
  tools?: any[];
  toolChoice?: any;
  traceMetadata?: Record<string, any>;
  modelOverride?: string;
}

export interface StreamTextOptions {
  provider?: LlmProviderName;
  temperature?: number;
  max_tokens?: number;
  onFinish?: (text: string, toolCalls?: any[]) => Promise<void>;
  enableTools?: boolean;
  traceMetadata?: Record<string, any>;
  modelOverride?: string;
}

function resolveProvider(provider?: LlmProviderName): LlmProviderName {
  return provider ?? (process.env.DEFAULT_LLM_PROVIDER as LlmProviderName | undefined) ?? 'deepseek';
}

const GLM_API_BASE_URL = process.env.GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const GLM_API_KEY = process.env.GLM_API_KEY;
const GLM_CHAT_MODEL = process.env.GLM_CHAT_MODEL || 'glm-5';
const OPENROUTER_API_BASE_URL = process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-4.1-mini';

const KIMI_API_BASE_URL = process.env.KIMI_API_URL || 'https://cn.haioi.net/v1';
const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_CHAT_MODEL = process.env.KIMI_CHAT_MODEL || 'kimi-k2.5';

const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';

const glm = GLM_API_KEY
  ? createOpenAI({
    baseURL: GLM_API_BASE_URL,
    apiKey: GLM_API_KEY,
  })
  : null;

const openrouter = OPENROUTER_API_KEY
  ? createOpenAI({
    baseURL: OPENROUTER_API_BASE_URL,
    apiKey: OPENROUTER_API_KEY,
  })
  : null;

const kimiProvider = KIMI_API_KEY
  ? createOpenAI({
    baseURL: KIMI_API_BASE_URL,
    apiKey: KIMI_API_KEY,
  })
  : null;

const openaiProvider = OPENAI_API_KEY
  ? createOpenAI({
    baseURL: OPENAI_API_BASE_URL,
    apiKey: OPENAI_API_KEY,
  })
  : null;

type OpenAICompatChoice = {
  message: {
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
};

type OpenAICompatResponse = {
  choices?: OpenAICompatChoice[];
};

async function glmGenerateText(
  messages: ChatMessage[],
  options?: GenerateTextOptions
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  if (!GLM_API_KEY) {
    throw new Error('GLM_API_KEY is not configured');
  }

  const response = await fetch(`${GLM_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: options?.modelOverride || GLM_CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      response_format: options?.responseFormat ? { type: options.responseFormat } : undefined,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GLM API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as OpenAICompatResponse;
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error('No response from GLM API');
  }

  return {
    reply: choice.message.content || '',
    toolCalls: choice.message.tool_calls,
  };
}

async function glmGenerateStructured<T>(
  messages: ChatMessage[],
  schema: { parse: (val: any) => T },
  options?: Omit<GenerateTextOptions, 'responseFormat' | 'tools' | 'toolChoice'>
): Promise<T> {
  const response = await glmGenerateText(messages, {
    ...options,
    responseFormat: 'json_object',
  });

  let json: unknown;
  try {
    json = JSON.parse(response.reply.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
  } catch {
    const jsonMatch = response.reply.match(/```json\n?([\s\S]*?)\n?```/)
      || response.reply.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse structured output from GLM');
    }
    json = JSON.parse((jsonMatch[1] || jsonMatch[0]).trim());
  }

  return schema.parse(json);
}

async function glmStreamText(
  messages: ChatMessage[],
  options?: StreamTextOptions
) {
  if (!glm) {
    throw new Error('GLM_API_KEY is not configured');
  }

  return sdkStreamText({
    model: glm(options?.modelOverride || GLM_CHAT_MODEL),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.max_tokens ?? 2000,
    onFinish: async ({ text, toolCalls }) => {
      if (options?.onFinish) {
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
    },
  });
}

async function openrouterGenerateText(
  messages: ChatMessage[],
  options?: GenerateTextOptions
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const response = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_APP_TITLE ? { 'X-Title': process.env.OPENROUTER_APP_TITLE } : {}),
    },
    body: JSON.stringify({
      model: options?.modelOverride || OPENROUTER_CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      response_format: options?.responseFormat ? { type: options.responseFormat } : undefined,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as OpenAICompatResponse;
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error('No response from OpenRouter API');
  }

  return {
    reply: choice.message.content || '',
    toolCalls: choice.message.tool_calls,
  };
}

async function openrouterGenerateStructured<T>(
  messages: ChatMessage[],
  schema: { parse: (val: any) => T },
  options?: Omit<GenerateTextOptions, 'responseFormat' | 'tools' | 'toolChoice'>
): Promise<T> {
  const response = await openrouterGenerateText(messages, {
    ...options,
    responseFormat: 'json_object',
  });

  let json: unknown;
  try {
    json = JSON.parse(response.reply.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
  } catch {
    const jsonMatch = response.reply.match(/```json\n?([\s\S]*?)\n?```/)
      || response.reply.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse structured output from OpenRouter');
    }
    json = JSON.parse((jsonMatch[1] || jsonMatch[0]).trim());
  }

  return schema.parse(json);
}

async function openrouterStreamText(
  messages: ChatMessage[],
  options?: StreamTextOptions
) {
  if (!openrouter) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  return sdkStreamText({
    model: openrouter(options?.modelOverride || OPENROUTER_CHAT_MODEL),
    headers: {
      ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_APP_TITLE ? { 'X-Title': process.env.OPENROUTER_APP_TITLE } : {}),
    },
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.max_tokens ?? 2000,
    onFinish: async ({ text, toolCalls }) => {
      if (options?.onFinish) {
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
    },
  });
}

async function kimiGenerateText(
  messages: ChatMessage[],
  options?: GenerateTextOptions
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  if (!KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY is not configured');
  }

  const response = await fetch(`${KIMI_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options?.modelOverride || KIMI_CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      response_format: options?.responseFormat ? { type: options.responseFormat } : undefined,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Kimi API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as OpenAICompatResponse;
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error('No response from Kimi API');
  }

  return {
    reply: choice.message.content || '',
    toolCalls: choice.message.tool_calls,
  };
}

async function kimiGenerateStructured<T>(
  messages: ChatMessage[],
  schema: { parse: (val: any) => T },
  options?: Omit<GenerateTextOptions, 'responseFormat' | 'tools' | 'toolChoice'>
): Promise<T> {
  const response = await kimiGenerateText(messages, {
    ...options,
    responseFormat: 'json_object',
  });

  let json: unknown;
  try {
    json = JSON.parse(response.reply.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
  } catch {
    const jsonMatch = response.reply.match(/```json\n?([\s\S]*?)\n?```/)
      || response.reply.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse structured output from Kimi');
    }
    json = JSON.parse((jsonMatch[1] || jsonMatch[0]).trim());
  }

  return schema.parse(json);
}

async function kimiStreamText(
  messages: ChatMessage[],
  options?: StreamTextOptions
) {
  if (!kimiProvider) {
    throw new Error('KIMI_API_KEY is not configured');
  }

  return sdkStreamText({
    model: kimiProvider(options?.modelOverride || KIMI_CHAT_MODEL),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.max_tokens ?? 2000,
    onFinish: async ({ text, toolCalls }) => {
      if (options?.onFinish) {
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
    },
  });
}

async function openaiGenerateText(
  messages: ChatMessage[],
  options?: GenerateTextOptions
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options?.modelOverride || OPENAI_CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      response_format: options?.responseFormat ? { type: options.responseFormat } : undefined,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as OpenAICompatResponse;
  const choice = data.choices?.[0];

  if (!choice) {
    throw new Error('No response from OpenAI API');
  }

  return {
    reply: choice.message.content || '',
    toolCalls: choice.message.tool_calls,
  };
}

async function openaiGenerateStructured<T>(
  messages: ChatMessage[],
  schema: { parse: (val: any) => T },
  options?: Omit<GenerateTextOptions, 'responseFormat' | 'tools' | 'toolChoice'>
): Promise<T> {
  const response = await openaiGenerateText(messages, {
    ...options,
    responseFormat: 'json_object',
  });

  let json: unknown;
  try {
    json = JSON.parse(response.reply.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
  } catch {
    const jsonMatch = response.reply.match(/```json\n?([\s\S]*?)\n?```/)
      || response.reply.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse structured output from OpenAI');
    }
    json = JSON.parse((jsonMatch[1] || jsonMatch[0]).trim());
  }

  return schema.parse(json);
}

async function openaiStreamText(
  messages: ChatMessage[],
  options?: StreamTextOptions
) {
  if (!openaiProvider) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return sdkStreamText({
    model: openaiProvider(options?.modelOverride || OPENAI_CHAT_MODEL),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.max_tokens ?? 2000,
    onFinish: async ({ text, toolCalls }) => {
      if (options?.onFinish) {
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
    },
  });
}

export async function generateText(
  messages: ChatMessage[],
  options?: GenerateTextOptions
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  const provider = resolveProvider(options?.provider);
  const fn = () => {
    switch (provider) {
      case 'openrouter':
        return openrouterGenerateText(messages, options);
      case 'glm':
        return glmGenerateText(messages, options);
      case 'kimi':
        return kimiGenerateText(messages, options);
      case 'openai':
        return openaiGenerateText(messages, options);
      case 'deepseek':
      default:
        return deepseekChatCompletion(messages, options);
    }
  };
  return withResilience(fn, { label: `${provider}-generateText` });
}

export async function generateStructured<T>(
  messages: ChatMessage[],
  schema: { parse: (val: any) => T },
  options?: Omit<GenerateTextOptions, 'responseFormat' | 'tools' | 'toolChoice'>
): Promise<T> {
  const provider = resolveProvider(options?.provider);
  const fn = () => {
    switch (provider) {
      case 'openrouter':
        return openrouterGenerateStructured(messages, schema, options);
      case 'glm':
        return glmGenerateStructured(messages, schema, options);
      case 'kimi':
        return kimiGenerateStructured(messages, schema, options);
      case 'openai':
        return openaiGenerateStructured(messages, schema, options);
      case 'deepseek':
      default:
        return deepseekStructuredCompletion(messages, schema, options);
    }
  };
  return withResilience(fn, { label: `${provider}-generateStructured` });
}

export async function streamText(
  messages: ChatMessage[],
  options?: StreamTextOptions
) {
  switch (resolveProvider(options?.provider)) {
    case 'openrouter':
      return openrouterStreamText(messages, options);
    case 'glm':
      return glmStreamText(messages, options);
    case 'kimi':
      return kimiStreamText(messages, options);
    case 'openai':
      return openaiStreamText(messages, options);
    case 'deepseek':
    default:
      return deepseekStreamChatCompletion(messages, options);
  }
}
