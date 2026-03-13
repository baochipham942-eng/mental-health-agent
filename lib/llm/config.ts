import type { LlmProviderName } from '@/lib/llm';

function readProviderEnv(key: string, fallback: LlmProviderName = 'deepseek'): LlmProviderName {
  const value = process.env[key];
  if (value === 'glm' || value === 'deepseek' || value === 'openrouter' || value === 'kimi') {
    return value;
  }
  return fallback;
}

export function getDefaultLlmProvider(): LlmProviderName {
  return readProviderEnv('DEFAULT_LLM_PROVIDER');
}

export function getSupportLlmProvider(): LlmProviderName {
  return readProviderEnv('SUPPORT_LLM_PROVIDER', getDefaultLlmProvider());
}

export function getAssessmentLlmProvider(): LlmProviderName {
  return readProviderEnv('ASSESSMENT_LLM_PROVIDER', getDefaultLlmProvider());
}

export function getStateClassifierLlmProvider(): LlmProviderName {
  return readProviderEnv('STATE_CLASSIFIER_LLM_PROVIDER', getDefaultLlmProvider());
}

export function getSafetyLlmProvider(): LlmProviderName {
  return readProviderEnv('SAFETY_LLM_PROVIDER', getDefaultLlmProvider());
}

export function getMemoryLlmProvider(): LlmProviderName {
  return readProviderEnv('MEMORY_LLM_PROVIDER', getDefaultLlmProvider());
}
