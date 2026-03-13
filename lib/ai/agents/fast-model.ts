import { createOpenAI } from '@ai-sdk/openai';

type FastProviderName = 'deepseek' | 'openrouter' | 'groq';

function resolveFastProvider(): FastProviderName {
  const explicit = process.env.FAST_AGENT_PROVIDER;
  if (explicit === 'deepseek' || explicit === 'openrouter' || explicit === 'groq') {
    return explicit;
  }

  if (process.env.GROQ_API_KEY) {
    return 'groq';
  }

  if (process.env.OPENROUTER_API_KEY) {
    return 'openrouter';
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return 'deepseek';
  }

  return 'groq';
}

export function getFastAgentConfig(): {
  provider: ReturnType<typeof createOpenAI> | null;
  providerName: FastProviderName;
  model: string;
} {
  const providerName = resolveFastProvider();

  if (providerName === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return { provider: null, providerName, model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat' };
    }

    return {
      provider: createOpenAI({
        baseURL: process.env.DEEPSEEK_API_URL?.replace(/\/chat\/completions$/, '') || 'https://api.deepseek.com/v1',
        apiKey,
      }),
      providerName,
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
    };
  }

  if (providerName === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { provider: null, providerName, model: process.env.OPENROUTER_FAST_MODEL || 'openai/gpt-4.1-mini' };
    }

    return {
      provider: createOpenAI({
        baseURL: process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1',
        apiKey,
      }),
      providerName,
      model: process.env.OPENROUTER_FAST_MODEL || 'openai/gpt-4.1-mini',
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { provider: null, providerName, model: process.env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant' };
  }

  return {
    provider: createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
    }),
    providerName,
    model: process.env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant',
  };
}
