/**
 * Kimi (Moonshot) Provider — 实验室圆桌论道专用
 * OpenAI 兼容接口，通过 cn.haioi.net 代理
 *
 * kimi-k2.5 是推理模型，默认会先花 300+ token 做 reasoning 再输出 content。
 * 圆桌论道场景（角色扮演/讨论）不需要深度推理，
 * 通过自定义 fetch 注入 reasoning_effort: "none" 跳过 reasoning 阶段：
 *   - 省 300+ reasoning token / 请求（9 次调用省 ~2700 token）
 *   - 流式响应从第一个 chunk 就有 content，不会因 reasoning 超时导致空响应
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const KIMI_API_URL = process.env.KIMI_API_URL || 'https://cn.haioi.net/v1';
const KIMI_API_KEY = process.env.KIMI_API_KEY;

/**
 * 自定义 fetch：向 kimi-k2.5 请求体注入 reasoning_effort: "none"
 */
const kimiNoReasoningFetch: typeof globalThis.fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      if (body.model?.startsWith('kimi-k2')) {
        body.reasoning_effort = 'none';
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // JSON 解析失败不影响原始请求
    }
  }
  return globalThis.fetch(input, init);
};

export const kimi = createOpenAICompatible({
  name: 'kimi',
  baseURL: KIMI_API_URL,
  apiKey: KIMI_API_KEY,
  fetch: kimiNoReasoningFetch,
  includeUsage: true,
});

// 默认模型：kimi-k2.5（通过 cn.haioi.net 代理）
export const KIMI_MODEL = 'kimi-k2.5';

export function getKimiModel(model?: string) {
  return kimi(model || KIMI_MODEL);
}
