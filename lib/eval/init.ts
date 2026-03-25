/**
 * Eval 模块启动 — 注册事件监听
 *
 * 由 instrumentation.ts 在 Next.js 启动时 import。
 * 将 evaluation:low-score 事件路由到 auto-ingest。
 */

import { evalEvents } from './eval-events';
import { checkAndIngest } from './auto-ingest';

evalEvents.on('evaluation:low-score', async (payload) => {
  try {
    await checkAndIngest(payload);
  } catch (e) {
    console.error('[EvalInit] Auto-ingest failed:', e);
  }
});

console.log('[EvalInit] 事件监听已注册');
