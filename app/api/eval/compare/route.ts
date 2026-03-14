import { NextRequest, NextResponse } from 'next/server';
import { getRunResults, getRunById } from '../db-reader';

/**
 * GET /api/eval/compare?run1=xxx&run2=yyy
 * 对比两个实验的维度级通过率
 */
export async function GET(req: NextRequest) {
  try {
    const run1Id = req.nextUrl.searchParams.get('run1');
    const run2Id = req.nextUrl.searchParams.get('run2');

    if (!run1Id || !run2Id) {
      return NextResponse.json({ error: '需要提供 run1 和 run2 参数' }, { status: 400 });
    }

    const run1 = getRunById(run1Id);
    const run2 = getRunById(run2Id);
    if (!run1 || !run2) {
      return NextResponse.json({ error: '未找到指定的实验' }, { status: 404 });
    }

    const results1 = getRunResults(run1Id);
    const results2 = getRunResults(run2Id);

    // 按维度聚合通过率
    function aggregateByDimension(results: any[]) {
      const stats: Record<string, { pass: number; total: number }> = {};
      for (const r of results) {
        // Judge results
        if (r.judge_results_json) {
          const judges = JSON.parse(r.judge_results_json);
          for (const [dim, val] of Object.entries(judges) as [string, any][]) {
            if (!stats[dim]) stats[dim] = { pass: 0, total: 0 };
            stats[dim].total++;
            if (val.result === 'Pass') stats[dim].pass++;
          }
        }
        // Code checks
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
        diff: Math.round((rate2 - rate1) * 10) / 10, // 正数表示 run2 更好
      };
    });

    const config1 = run1.config_json ? JSON.parse(run1.config_json) : {};
    const config2 = run2.config_json ? JSON.parse(run2.config_json) : {};

    return NextResponse.json({
      run1: { id: run1Id, model: run1.model || config1.model || 'deepseek', mode: run1.mode || 'benchmark', timestamp: run1.started_at },
      run2: { id: run2Id, model: run2.model || config2.model || 'deepseek', mode: run2.mode || 'benchmark', timestamp: run2.started_at },
      comparison,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
