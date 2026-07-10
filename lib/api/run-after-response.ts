import { after } from 'next/server';

/**
 * 把"响应返回后"的后台任务交给 next/server 的 after()。
 *
 * 裸 Promise.resolve().then() 在本地长驻 Node 能跑完，但在 Vercel / 阿里云 FC 等
 * serverless 环境下，响应流结束后实例可能被立刻冻结，导致后台任务（含数秒级 LLM 调用）半路被掐。
 * after() 会让运行时等待任务完成后再回收实例。
 *
 * 兜底：若调用点不在 request scope（after 抛错），回退到原 fire-and-forget，绝不影响主链路。
 */
export function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
