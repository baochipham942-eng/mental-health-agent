/**
 * 简易内存 Rate Limiter（无需 Redis）
 * 适用于单实例部署（Vercel Serverless / 阿里云 FC）
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// 每 5 分钟清理过期条目，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * 检查是否超过速率限制
 * @returns { success: true } 或 { success: false, retryAfterMs }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { success: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true };
  }

  if (entry.count >= maxRequests) {
    return { success: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { success: true };
}
