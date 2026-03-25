/**
 * Next.js Instrumentation Hook
 *
 * 在 Node.js 运行时启动时初始化 eval 模块事件监听。
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/eval/init');
  }
}
