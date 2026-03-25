/**
 * 轨迹评测权重配置
 *
 * 从 JSON 配置加载。6 个 pipeline 步骤的加权评分。
 * safety + triage 各占 25%（安全与路由是最核心的决策）。
 */

import { TRACE_STEP_WEIGHTS } from '../config';

export { TRACE_STEP_WEIGHTS };

/**
 * 根据各步骤判定结果计算加权综合分和等级
 *
 * 评分规则：Pass=1.0, Drift=0.5, Wrong=0.0, Skip=不计入
 */
export function computeTraceScore(results: Array<{ step: string; verdict: string }>): { score: number; grade: string } {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of results) {
    const weight = TRACE_STEP_WEIGHTS[r.step] ?? 0;
    if (r.verdict === 'Skip') continue;
    totalWeight += weight;
    if (r.verdict === 'Pass') weightedSum += weight;
    else if (r.verdict === 'Drift') weightedSum += weight * 0.5;
    // Wrong = 0
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
  let grade = 'F';
  if (score >= 0.9) grade = 'A';
  else if (score >= 0.7) grade = 'B';
  else if (score >= 0.5) grade = 'C';
  else if (score >= 0.3) grade = 'D';

  return { score, grade };
}
