/**
 * Prompt 版本注册 → 自动触发评测
 *
 * 监听 prompt:version-registered 事件，当 isNew=true 时：
 * 1. 在 prompt_ci_runs 表创建一条 PENDING 记录
 * 2. 日志记录触发信息（真正的评测执行由外部流程驱动）
 */

import { createCIRun } from './prompt-ci-store';
import type { PromptVersionRegisteredPayload } from './eval-events';

/**
 * 处理新 Prompt 版本注册事件
 */
export async function handlePromptVersionRegistered(payload: PromptVersionRegisteredPayload): Promise<void> {
  // 只处理新版本
  if (!payload.isNew) {
    console.log(`[PromptEvalTrigger] 跳过已存在的版本: ${payload.versionId} (${payload.name})`);
    return;
  }

  // 创建 CI Run 记录
  const ciRun = createCIRun({
    promptVersionId: payload.versionId,
    promptName: payload.name,
  });

  console.log(
    `[PromptEvalTrigger] 已创建 CI Run: ${ciRun.id} | 版本: ${payload.versionId} | Prompt: ${payload.name}`
  );

  // TODO: 未来接入真正的评测触发（spawn child process 或调用 /api/eval/start）
  // 当前仅记录 CI Run，评测执行由外部流程驱动
  console.log(
    `[PromptEvalTrigger] 评测触发已记录，等待外部执行: ciRunId=${ciRun.id}`
  );
}
