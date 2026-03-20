import {
  chatCompletion as deepseekChatCompletion,
  chatStructuredCompletion as deepseekStructuredCompletion,
  streamChatCompletion as deepseekStreamChatCompletion,
  type ChatMessage,
  type ToolCall,
} from '@/lib/ai/deepseek';
import { withResilience } from './resilience';
import { createOpenAICompatProvider } from './openai-compat-provider';

export type { ChatMessage, ToolCall };

export type LlmProviderName = 'deepseek' | 'glm' | 'openrouter' | 'kimi' | 'openai';

/** OpenAI function calling 格式的工具定义 */
export interface OpenAIFunctionTool {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** OpenAI tool_choice 参数类型 */
export type ToolChoice = 'auto' | 'none' | 'required' | {
  type: 'function';
  function: { name: string };
};

export interface GenerateTextOptions {
  provider?: LlmProviderName;
  temperature?: number;
  max_tokens?: number;
  responseFormat?: 'json_object' | 'text';
  tools?: OpenAIFunctionTool[];
  toolChoice?: ToolChoice;
  traceMetadata?: Record<string, unknown>;
  modelOverride?: string;
  timeoutMs?: number;
}

export interface StreamTextOptions {
  provider?: LlmProviderName;
  temperature?: number;
  max_tokens?: number;
  onFinish?: (text: string, toolCalls?: ToolCall[]) => Promise<void>;
  enableTools?: boolean;
  traceMetadata?: Record<string, unknown>;
  modelOverride?: string;
}

function resolveProvider(provider?: LlmProviderName): LlmProviderName {
  return provider ?? (process.env.DEFAULT_LLM_PROVIDER as LlmProviderName | undefined) ?? 'deepseek';
}

// =================================================================================
// Provider 实例（通过工厂函数创建，消除重复代码）
// =================================================================================

const glmProvider = createOpenAICompatProvider({
  name: 'GLM',
  baseURL: process.env.GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: process.env.GLM_API_KEY,
  defaultModel: process.env.GLM_CHAT_MODEL || 'glm-5',
});

const openrouterProvider = createOpenAICompatProvider({
  name: 'OpenRouter',
  baseURL: process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultModel: process.env.OPENROUTER_CHAT_MODEL || 'openai/gpt-5.4-mini',
  extraHeaders: {
    ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
    ...(process.env.OPENROUTER_APP_TITLE ? { 'X-Title': process.env.OPENROUTER_APP_TITLE } : {}),
  },
});

const kimiLlmProvider = createOpenAICompatProvider({
  name: 'Kimi',
  baseURL: process.env.KIMI_API_URL || 'https://cn.haioi.net/v1',
  apiKey: process.env.KIMI_API_KEY,
  defaultModel: process.env.KIMI_CHAT_MODEL || 'kimi-k2.5',
});

const openaiLlmProvider = createOpenAICompatProvider({
  name: 'OpenAI',
  baseURL: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: process.env.OPENAI_CHAT_MODEL || 'gpt-5.4',
});

// =================================================================================
// Provider 路由
// =================================================================================

function getProvider(name: LlmProviderName) {
  switch (name) {
    case 'glm': return glmProvider;
    case 'openrouter': return openrouterProvider;
    case 'kimi': return kimiLlmProvider;
    case 'openai': return openaiLlmProvider;
    default: return null; // deepseek 走独立实现
  }
}

export async function generateText(
  messages: ChatMessage[],
  options?: GenerateTextOptions
): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
  const provider = resolveProvider(options?.provider);
  const compat = getProvider(provider);
  const fn = compat
    ? () => compat.generateText(messages, options)
    : () => deepseekChatCompletion(messages, options);
  return withResilience(fn, { label: `${provider}-generateText`, ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}) });
}

export async function generateStructured<T>(
  messages: ChatMessage[],
  schema: { parse: (val: unknown) => T },
  options?: Omit<GenerateTextOptions, 'responseFormat' | 'tools' | 'toolChoice'>
): Promise<T> {
  const provider = resolveProvider(options?.provider);
  const compat = getProvider(provider);
  const fn = compat
    ? () => compat.generateStructured(messages, schema, options)
    : () => deepseekStructuredCompletion(messages, schema, options);
  return withResilience(fn, { label: `${provider}-generateStructured` });
}

export async function streamText(
  messages: ChatMessage[],
  options?: StreamTextOptions
) {
  const provider = resolveProvider(options?.provider);
  const compat = getProvider(provider);
  if (compat) {
    return compat.streamText(messages, options);
  }
  return deepseekStreamChatCompletion(messages, options);
}
