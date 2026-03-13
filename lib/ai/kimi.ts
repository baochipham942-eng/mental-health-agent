/**
 * Kimi (Moonshot) Provider — 实验室圆桌论道专用
 * OpenAI 兼容接口，支持高并发
 */

import { createOpenAI } from '@ai-sdk/openai';

const KIMI_API_URL = process.env.KIMI_API_URL || 'https://cn.haioi.net/v1';
const KIMI_API_KEY = process.env.KIMI_API_KEY;

export const kimi = createOpenAI({
  baseURL: KIMI_API_URL,
  apiKey: KIMI_API_KEY,
});

// 默认模型：kimi-k2.5（通过 cn.haioi.net 代理）
export const KIMI_MODEL = 'kimi-k2.5';

export function getKimiModel(model?: string) {
  return kimi(model || KIMI_MODEL);
}
