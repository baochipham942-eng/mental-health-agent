import { NextRequest, NextResponse } from 'next/server';
import { getRunResults, getRunById } from '../db-reader';

/**
 * GET /api/eval/compare?run1=xxx&run2=yyy
 * 对比两个实验的维度级通过率 + 汇总 + 退化/改进
 */
export async function GET(req: NextRequest) {
  try {
    const run1Id = req.nextUrl.searchParams.get('run1');
    const run2Id = req.nextUrl.searchParams.get('run2');

    if (!run1Id || !run2Id) {
      return NextResponse.json({ error: '需要提供 run1 和 run2 参数' }, { status: 400 });
    }

    const run1 = await getRunById(run1Id);
    const run2 = await getRunById(run2Id);
    if (!run1 || !run2) {
      return NextResponse.json({ error: '未找到指定的实验' }, { status: 404 });
    }

    const results1 = await getRunResults(run1Id);
    const results2 = await getRunResults(run2Id);

    // 按维度聚合通过率
    function aggregateByDimension(results: any[]) {
      const stats: Record<string, { pass: number; total: number }> = {};
      for (const r of results) {
        if (r.judge_results_json) {
          const judges = JSON.parse(r.judge_results_json);
          for (const [dim, val] of Object.entries(judges) as [string, any][]) {
            if (!stats[dim]) stats[dim] = { pass: 0, total: 0 };
            stats[dim].total++;
            if (val.result === 'Pass') stats[dim].pass++;
          }
        }
        if (r.code_checks_json) {
          const checks = JSON.parse(r.code_checks_json);
          for (const [check, result] of Object.entries(checks) as [string, string][]) {
            if (!stats[check]) stats[check] = { pass: 0, total: 0 };
            stats[check].total++;
            if (result === 'pass') stats[check].pass++;
          }
        }
      }
      return stats;
    }

    // 按 case_id + dimension 提取每条检查的通过/失败状态
    function extractCaseDimResults(results: any[]): Map<string, string> {
      // key: `${case_id}::${dimension}`, value: 'Pass' | 'Fail'
      // 同一 case+dim 可能有多条（多轮），取最差结果（有 Fail 就算 Fail）
      const map = new Map<string, string>();
      for (const r of results) {
        if (r.judge_results_json) {
          const judges = JSON.parse(r.judge_results_json);
          for (const [dim, val] of Object.entries(judges) as [string, any][]) {
            const key = `${r.case_id}::${dim}`;
            const existing = map.get(key);
            if (val.result === 'Pass' && !existing) map.set(key, 'Pass');
            if (val.result !== 'Pass') map.set(key, 'Fail');
          }
        }
        if (r.code_checks_json) {
          const checks = JSON.parse(r.code_checks_json);
          for (const [check, result] of Object.entries(checks) as [string, string][]) {
            const key = `${r.case_id}::${check}`;
            const existing = map.get(key);
            if (result === 'pass' && !existing) map.set(key, 'Pass');
            if (result !== 'pass') map.set(key, 'Fail');
          }
        }
      }
      return map;
    }

    // 计算汇总统计
    function computeSummary(results: any[], stats: Record<string, { pass: number; total: number }>) {
      let totalPass = 0, totalChecks = 0;
      for (const s of Object.values(stats)) {
        totalPass += s.pass;
        totalChecks += s.total;
      }
      const passRate = totalChecks > 0 ? Math.round(totalPass / totalChecks * 1000) / 10 : 0;

      let scoreSum = 0, scoreCount = 0;
      let ttftSum = 0, ttftCount = 0;
      const caseIds = new Set<string>();

      for (const r of results) {
        caseIds.add(r.case_id);
        if (r.weighted_score != null) {
          scoreSum += r.weighted_score;
          scoreCount++;
        }
        if (r.ttft_ms != null) {
          ttftSum += r.ttft_ms;
          ttftCount++;
        }
      }

      return {
        passRate,
        avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount * 100) / 100 : 0,
        avgTtft: ttftCount > 0 ? Math.round(ttftSum / ttftCount) : 0,
        totalCases: caseIds.size,
      };
    }

    const stats1 = aggregateByDimension(results1);
    const stats2 = aggregateByDimension(results2);

    // 合并所有维度
    const allDimensions = [...new Set([...Object.keys(stats1), ...Object.keys(stats2)])].sort();

    const comparison = allDimensions.map(dim => {
      const s1 = stats1[dim] || { pass: 0, total: 0 };
      const s2 = stats2[dim] || { pass: 0, total: 0 };
      const rate1 = s1.total > 0 ? Math.round(s1.pass / s1.total * 1000) / 10 : 0;
      const rate2 = s2.total > 0 ? Math.round(s2.pass / s2.total * 1000) / 10 : 0;
      return {
        dimension: dim,
        run1: { pass: s1.pass, total: s1.total, rate: rate1 },
        run2: { pass: s2.pass, total: s2.total, rate: rate2 },
        diff: Math.round((rate2 - rate1) * 10) / 10,
      };
    });

    // 汇总
    const summary1 = computeSummary(results1, stats1);
    const summary2 = computeSummary(results2, stats2);

    // 退化与改进
    const caseDim1 = extractCaseDimResults(results1);
    const caseDim2 = extractCaseDimResults(results2);

    const regressions: { caseId: string; dimension: string; run1: string; run2: string }[] = [];
    const improvements: { caseId: string; dimension: string; run1: string; run2: string }[] = [];

    // 遍历 run1 的所有 key，找退化（run1 Pass, run2 Fail）
    for (const [key, status1] of caseDim1) {
      const status2 = caseDim2.get(key);
      if (status1 === 'Pass' && status2 === 'Fail') {
        const [caseId, dimension] = key.split('::');
        regressions.push({ caseId, dimension, run1: 'Pass', run2: 'Fail' });
      }
    }

    // 遍历所有共有 key，找改进（run1 Fail, run2 Pass）
    for (const [key, status1] of caseDim1) {
      const status2 = caseDim2.get(key);
      if (status1 === 'Fail' && status2 === 'Pass') {
        const [caseId, dimension] = key.split('::');
        improvements.push({ caseId, dimension, run1: 'Fail', run2: 'Pass' });
      }
    }

    const config1 = run1.config_json ? JSON.parse(run1.config_json) : {};
    const config2 = run2.config_json ? JSON.parse(run2.config_json) : {};

    return NextResponse.json({
      run1: { id: run1Id, model: run1.model || config1.model || 'deepseek', mode: run1.mode || 'benchmark', timestamp: run1.started_at },
      run2: { id: run2Id, model: run2.model || config2.model || 'deepseek', mode: run2.mode || 'benchmark', timestamp: run2.started_at },
      comparison,
      summary: {
        run1: summary1,
        run2: summary2,
        diff: {
          passRate: Math.round((summary2.passRate - summary1.passRate) * 10) / 10,
          avgScore: Math.round((summary2.avgScore - summary1.avgScore) * 100) / 100,
          avgTtft: Math.round(summary2.avgTtft - summary1.avgTtft),
        },
      },
      regressions,
      improvements,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
