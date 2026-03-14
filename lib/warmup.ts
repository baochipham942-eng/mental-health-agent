/**
 * 冷启动预热客户端
 *
 * 在用户 Onboarding 选择图片时触发，提前预热服务器容器：
 * - Prisma 数据库连接池
 * - DeepSeek LLM API 连接
 *
 * 幂等设计：多次调用只触发一次预热请求
 */

let warmupFired = false;
let warmupPromise: Promise<void> | null = null;

export function triggerWarmup(): void {
  if (warmupFired) return;
  warmupFired = true;

  warmupPromise = fetch('/api/warmup', { method: 'POST' })
    .then(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[warmup] 服务预热完成');
      }
    })
    .catch(() => {
      // 预热失败静默处理，不影响用户体验
      warmupFired = false; // 允许重试
    });
}

/** 等待预热完成（可选，用于确保预热后再发起首次请求） */
export async function waitForWarmup(): Promise<void> {
  if (warmupPromise) {
    await warmupPromise;
  }
}

/** 重置状态（仅用于测试） */
export function resetWarmup(): void {
  warmupFired = false;
  warmupPromise = null;
}
