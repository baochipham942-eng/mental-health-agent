/**
 * OpenAI 兼容 Provider 工厂
 * 消除 glm/openrouter/kimi/openai 四个 provider 的重复代码
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText as sdkStreamText } from 'ai';
import type { ChatMessage, ToolCall } from '@/lib/ai/deepseek';
import type { GenerateTextOptions, StreamTextOptions } from './index';

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

export interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string | undefined;
  defaultModel: string;
  extraHeaders?: Record<string, string>;
}

/**
 * 从 LLM 回复中提取 JSON（处理 markdown 包裹等情况）
 */
function parseJsonFromReply(reply: string, providerName: string): unknown {
  try {
    return JSON.parse(reply.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
  } catch {
    const jsonMatch = reply.match(/```json\n?([\s\S]*?)\n?```/)
      || reply.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error(`Failed to parse structured output from ${providerName}`);
    }
    return JSON.parse((jsonMatch[1] || jsonMatch[0]).trim());
  }
}

/**
 * 创建 OpenAI 兼容 Provider 的三个标准函数
 */
export function createOpenAICompatProvider(config: ProviderConfig) {
  const { name, baseURL, apiKey, defaultModel, extraHeaders } = config;

  const sdkProvider = apiKey
    ? createOpenAICompatible({
        name: name.toLowerCase(),
        baseURL,
        apiKey,
        headers: extraHeaders,
        includeUsage: true,
      })
    : null;

  async function compatGenerateText(
    messages: ChatMessage[],
    options?: GenerateTextOptions,
  ): Promise<{ reply: string; toolCalls?: ToolCall[] }> {
    if (!apiKey) {
      throw new Error(`${name.toUpperCase()}_API_KEY is not configured`);
    }

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: options?.modelOverride || defaultModel,
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
      throw new Error(`${name} API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenAICompatResponse;
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error(`No response from ${name} API`);
    }

    return {
      reply: choice.message.content || '',
      toolCalls: choice.message.tool_calls,
    };
  }

  async function compatGenerateStructured<T>(
    messages: ChatMessage[],
    schema: { parse: (val: any) => T },
    options?: Omit<GenerateTextOptions, 'responseFormat' | 'tools' | 'toolChoice'>,
  ): Promise<T> {
    const response = await compatGenerateText(messages, {
      ...options,
      responseFormat: 'json_object',
    });
    const json = parseJsonFromReply(response.reply, name);
    return schema.parse(json);
  }

  async function compatStreamText(
    messages: ChatMessage[],
    options?: StreamTextOptions,
  ) {
    if (!sdkProvider) {
      throw new Error(`${name.toUpperCase()}_API_KEY is not configured`);
    }

    const streamStartMs = Date.now();

    return sdkStreamText({
      model: sdkProvider(options?.modelOverride || defaultModel),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.max_tokens ?? 2000,
      onFinish: async ({ text, usage, toolCalls }) => {
        if (options?.onFinish) {
          const formattedToolCalls = toolCalls?.map((tc: any) => ({
            id: tc.toolCallId,
            type: 'function' as const,
            function: {
              name: tc.toolName,
              arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input ?? {}),
            },
          }));
          await options.onFinish(text, formattedToolCalls);
        }

        // Sprint 4: 写入 ChatMetric
        if (usage) {
          const convId = (options?.traceMetadata as any)?.sessionId;
          if (convId) {
            import('@/lib/observability/metrics-collector').then(({ recordMetric: recordChatMetric }) => {
              recordChatMetric({
                conversationId: convId,
                model: options?.modelOverride || defaultModel,
                promptTokens: usage.inputTokens ?? 0,
                completionTokens: usage.outputTokens ?? 0,
                totalTokens: usage.totalTokens ?? 0,
                latencyMs: Date.now() - streamStartMs,
              }).catch(() => {});
            }).catch(() => {});
          }
        }
      },
    });
  }

  return {
    generateText: compatGenerateText,
    generateStructured: compatGenerateStructured,
    streamText: compatStreamText,
  };
}
