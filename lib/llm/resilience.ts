/**
 * LLM 韧性层
 * 为 LLM 调用提供超时、重试和 provider 降级能力
 */

export interface ResilienceOptions {
  /** 超时毫秒数，默认 15000 */
  timeoutMs?: number;
  /** 最大重试次数（仅对 5xx 和网络错误重试），默认 1 */
  maxRetries?: number;
  /** 操作名称，用于日志 */
  label?: string;
}

/**
 * 判断错误是否值得重试（5xx / 网络错误 / 超时）
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message;
    // 5xx 错误
    if (/\b5\d{2}\b/.test(msg)) return true;
    // 网络错误
    if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(msg)) return true;
    // AbortError（超时）
    if (error.name === 'AbortError' || /timeout|aborted/i.test(msg)) return true;
    // 429 限流也重试
    if (/\b429\b/.test(msg)) return true;
  }
  return false;
}

/**
 * 为异步操作添加超时控制
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`[LLM:${label}] Timeout after ${timeoutMs}ms`));
        });
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 为 LLM 调用添加韧性包装：超时 + 重试
 *
 * @example
 * const result = await withResilience(
 *   () => glmGenerateText(messages, options),
 *   { timeoutMs: 15000, maxRetries: 1, label: 'glm-generateText' }
 * );
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  options?: ResilienceOptions,
): Promise<T> {
  const {
    timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 15000),
    maxRetries = 1,
    label = 'llm',
  } = options || {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn, timeoutMs, label);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && isRetryable(error)) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.warn(
          `[LLM:${label}] Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms:`,
          error instanceof Error ? error.message : error,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      break;
    }
  }

  throw lastError;
}
