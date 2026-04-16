/**
 * 轨迹评测统一入口
 *
 * 串联 6 个 judge（4 个 LLM + 1 个混合 + 1 个纯规则），
 * 计算加权综合分，返回 TraceEvalResult。
 *
 * LLM Judge 并行执行（Promise.all），规则 Judge 同步执行。
 * 每个 judge 独立 try-catch，失败标记为 Skip。
 */

import type { TraceEvalInput, TraceEvalResult, StepEvalResult } from './types';
import { computeTraceScore } from './weights';
import { judge as triageJudge } from './judges/triage-judge';
import { judge as safetyJudge } from './judges/safety-judge';
import { judge as personaJudge } from './judges/persona-judge';
import { judge as emotionJudge } from './judges/emotion-judge';
import { judge as toolJudge } from './judges/tool-judge';
import { judge as guardJudge } from './judges/guard-judge';

export type { TraceEvalInput, TraceEvalResult, StepEvalResult } from './types';
export type { TraceStep, TraceStepName, StepVerdict } from './types';
export { TRACE_STEP_WEIGHTS, computeTraceScore } from './weights';
export { writeTraceEval, getTraceEvals, getTraceStats, updateTraceEvalLabels } from './db';
export type { TraceEvalRow, TraceStats } from './db';

interface EvalConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

/**
 * 执行完整的轨迹评测
 *
 * @param input - 从 stream metadata 提取的评测输入数据
 * @param config - LLM API 配置（供 LLM Judge 使用）
 * @returns TraceEvalResult 包含各步骤评测结果和加权综合分
 */
export async function evaluateTrace(
  input: TraceEvalInput,
  config: EvalConfig,
): Promise<TraceEvalResult> {
  const steps: StepEvalResult[] = [];

  // ========== 1. 纯规则 Judge 同步执行 ==========
  try {
    const guardResult = await guardJudge(input, config);
    steps.push(guardResult);
  } catch (err: any) {
    steps.push({ step: 'guard', verdict: 'Skip', critique: `guard judge 异常: ${err.message}` });
  }

  // ========== 2. LLM Judge 并行执行 ==========
  const llmJudges = [
    { name: 'triage' as const, fn: triageJudge },
    { name: 'safety' as const, fn: safetyJudge },
    { name: 'persona' as const, fn: personaJudge },
    { name: 'emotion' as const, fn: emotionJudge },
    { name: 'tool' as const, fn: toolJudge },
  ];

  const llmResults = await Promise.allSettled(
    llmJudges.map(j => j.fn(input, config)),
  );

  for (let i = 0; i < llmJudges.length; i++) {
    const result = llmResults[i];
    if (result.status === 'fulfilled') {
      steps.push(result.value);
    } else {
      steps.push({
        step: llmJudges[i].name,
        verdict: 'Skip',
        critique: `Judge 执行失败: ${result.reason?.message || '未知错误'}`,
      });
    }
  }

  // ========== 3. 计算加权综合分 ==========
  const { score, grade } = computeTraceScore(
    steps.map(s => ({ step: s.step, verdict: s.verdict })),
  );

  return {
    conversationId: input.conversationId,
    steps,
    traceScore: score,
    traceGrade: grade,
    evaluatedBy: config.model,
    evaluatedAt: new Date().toISOString(),
  };
}
